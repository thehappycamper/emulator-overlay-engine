-- Read-only BizHawk 2.11.1 provider for the shared Emerald Rev 0 contract.
-- Emerald addresses and Gen III decoding live in the game-owned Lua module.

local snapshotPath = os.getenv("EMERALD_SOURCE_SNAPSHOT_PATH")
local modulePath = os.getenv("EMERALD_ACQUISITION_MODULE_PATH")
local expectedVersion = os.getenv("BIZHAWK_EXPECTED_VERSION")
local expectedSystemId = os.getenv("BIZHAWK_EXPECTED_SYSTEM_ID")
local expectedRomHash = os.getenv("BIZHAWK_EXPECTED_ROM_HASH")

local function requireSetting(name, value)
    if value == nil or value == "" then
        error("Missing required connector environment setting: " .. name)
    end
end

requireSetting("EMERALD_SOURCE_SNAPSHOT_PATH", snapshotPath)
requireSetting("EMERALD_ACQUISITION_MODULE_PATH", modulePath)
requireSetting("BIZHAWK_EXPECTED_VERSION", expectedVersion)
requireSetting("BIZHAWK_EXPECTED_SYSTEM_ID", expectedSystemId)
requireSetting("BIZHAWK_EXPECTED_ROM_HASH", expectedRomHash)

local emerald = assert(loadfile(modulePath))()
local source = {
    provider = { id = "bizhawk", name = "BizHawk", version = expectedVersion },
    integration = "lua",
    memory = {
        primaryDomain = "System Bus",
        verifiedDomains = { "EWRAM", "IWRAM" },
    },
}

local function clearSourceSnapshot()
    os.remove(snapshotPath .. ".tmp")
    os.remove(snapshotPath)
end

local function atomicWrite(contents)
    local temporaryPath = snapshotPath .. ".tmp"
    local file, openError = io.open(temporaryPath, "wb")
    if file == nil then
        error("Could not open Emerald source snapshot temporary file: " .. tostring(openError))
    end

    local wrote, writeError = file:write(contents .. "\n")
    local flushed, flushError = nil, nil
    if wrote then flushed, flushError = file:flush() end
    local closed, closeError = file:close()
    if not wrote or not flushed or not closed then
        os.remove(temporaryPath)
        error("Could not write Emerald source snapshot: " .. tostring(writeError or flushError or closeError))
    end

    os.remove(snapshotPath)
    local renamed, renameError = os.rename(temporaryPath, snapshotPath)
    if not renamed then
        os.remove(temporaryPath)
        error("Could not publish Emerald source snapshot: " .. tostring(renameError))
    end
end

local function failClosed(message)
    clearSourceSnapshot()
    error(message)
end

local actualVersion = client.getversion()
local actualSystemId = emu.getsystemid()
local actualRomHash = string.upper(gameinfo.getromhash())
if actualVersion ~= expectedVersion then
    failClosed("Unsupported BizHawk version: " .. actualVersion)
elseif actualSystemId ~= expectedSystemId then
    failClosed("Unsupported emulated system: " .. actualSystemId)
elseif actualRomHash ~= string.upper(expectedRomHash) then
    failClosed("Unsupported game image hash: " .. actualRomHash)
end

local domains = {}
for _, name in pairs(memory.getmemorydomainlist()) do
    domains[name] = true
end
for _, name in ipairs({ "System Bus", "EWRAM", "IWRAM" }) do
    if not domains[name] then
        failClosed("Required BizHawk memory domain is unavailable: " .. name)
    end
end
if memory.getmemorydomainsize("System Bus") ~= 0x10000000
    or memory.getmemorydomainsize("EWRAM") ~= 0x40000
    or memory.getmemorydomainsize("IWRAM") ~= 0x8000 then
    failClosed("Unexpected BizHawk GBA memory-domain size")
end

local function directDomain(address)
    if address >= 0x02000000 and address < 0x02040000 then
        return "EWRAM", address - 0x02000000
    end
    if address >= 0x03000000 and address < 0x03008000 then
        return "IWRAM", address - 0x03000000
    end
    failClosed(string.format("Emerald acquisition address is outside verified WRAM: 0x%08X", address))
end

local function verifiedRead(address, systemRead, directRead)
    local domain, offset = directDomain(address)
    local systemValue = systemRead(address, "System Bus")
    local directValue = directRead(offset, domain)
    if systemValue ~= directValue then
        failClosed(string.format(
            "BizHawk memory-domain mismatch at 0x%08X: System Bus=%u %s=%u",
            address,
            systemValue,
            domain,
            directValue
        ))
    end
    return systemValue
end

local reader = {
    read8 = function(address)
        return verifiedRead(address, memory.read_u8, memory.read_u8)
    end,
    read16 = function(address)
        return verifiedRead(address, memory.read_u16_le, memory.read_u16_le)
    end,
    read32 = function(address)
        return verifiedRead(address, memory.read_u32_le, memory.read_u32_le)
    end,
}

local identity = {
    gameCode = emerald.identity.gameCode,
    title = emerald.identity.title,
    revision = emerald.identity.revision,
    crc32 = emerald.identity.crc32,
}

local lastSnapshot = nil
local nextWriteFrame = -1
while true do
    local frame = emu.framecount()
    if frame >= nextWriteFrame or frame < nextWriteFrame - 15 then
        local ok, result = pcall(function()
            return emerald.snapshotJson(source, identity, emerald.acquire(reader))
        end)
        if not ok then failClosed(tostring(result)) end
        if result ~= lastSnapshot then
            atomicWrite(result)
            lastSnapshot = result
        end
        nextWriteFrame = frame + 15
    end
    emu.frameadvance()
end
