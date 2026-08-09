-- Read-only mGBA provider for Pokemon Emerald (English retail Rev 0).
-- Game addresses, Gen III decoding, and the source shape are owned by the
-- shared Emerald acquisition module supplied by the repository launcher.

local modulePath = os.getenv("EMERALD_ACQUISITION_MODULE_PATH")
local snapshotPath = os.getenv("EMERALD_SOURCE_SNAPSHOT_PATH")

if modulePath == nil or modulePath == "" then
    error("Missing EMERALD_ACQUISITION_MODULE_PATH; launch mGBA with npm run proof:emerald")
end
if snapshotPath == nil or snapshotPath == "" then
    error("Missing EMERALD_SOURCE_SNAPSHOT_PATH; launch mGBA with npm run proof:emerald")
end

-- The shared module's reference-data tables (species/moves/items/locations/
-- charmap, see adapters/pokemon-emerald-us-rev0/data/) live alongside it;
-- derive that directory from the already-known module path rather than
-- requiring a second environment variable for the same location.
local moduleDir = modulePath:match("(.*[/\\])") or "./"
local emerald = assert(loadfile(modulePath))(moduleDir .. "data/")
local output = console:createBuffer("Emerald acquisition source")
local supported = false
local identity = nil
local lastText = nil
local lastSnapshotText = nil

local source = {
    provider = { id = "mgba", name = "mGBA" },
    integration = "lua",
    memory = { primaryDomain = "mGBA emu API", verifiedDomains = {} },
}

local reader = {
    read8 = function(address) return emu:read8(address) end,
    read16 = function(address) return emu:read16(address) end,
    read32 = function(address) return emu:read32(address) end,
}

local function checksumToU32(checksum)
    if type(checksum) ~= "string" or #checksum ~= 4 then return nil end
    local b1, b2, b3, b4 = checksum:byte(1, 4)
    return (((b1 * 256 + b2) * 256 + b3) * 256 + b4)
end

local function render(text)
    if text ~= lastText then
        output:clear()
        output:print(text .. "\n")
        lastText = text
    end
end

local function clearSourceSnapshot()
    lastSnapshotText = nil
    os.remove(snapshotPath .. ".tmp")
    os.remove(snapshotPath)
end

local function replaceSourceSnapshot(text)
    if text == lastSnapshotText then return true end

    local temporaryPath = snapshotPath .. ".tmp"
    local file, openError = io.open(temporaryPath, "wb")
    if file == nil then
        console:error("Could not open Emerald source snapshot temporary file: " .. tostring(openError))
        return false
    end

    local wrote, writeError = file:write(text .. "\n")
    local flushed, flushError = nil, nil
    if wrote then flushed, flushError = file:flush() end
    local closed, closeError = file:close()
    if not wrote or not flushed or not closed then
        os.remove(temporaryPath)
        console:error("Could not write Emerald source snapshot: " .. tostring(writeError or flushError or closeError))
        return false
    end

    local renamed, renameError = os.rename(temporaryPath, snapshotPath)
    if not renamed then
        os.remove(snapshotPath)
        renamed, renameError = os.rename(temporaryPath, snapshotPath)
    end
    if not renamed then
        os.remove(temporaryPath)
        console:error("Could not publish Emerald source snapshot: " .. tostring(renameError))
        return false
    end

    lastSnapshotText = text
    return true
end

local function detectGame()
    if not emu then
        supported = false
        identity = nil
        clearSourceSnapshot()
        render('{"status":"waiting-for-game"}')
        return
    end

    local crc32 = checksumToU32(emu:checksum(C.CHECKSUM.CRC32))
    identity = {
        gameCode = emu:getGameCode(),
        title = emu:getGameTitle(),
        revision = emu.memory.cart0:read8(0xBC),
        crc32 = crc32 and string.format("%08X", crc32) or "",
    }

    local ok, identityError = pcall(emerald.assertIdentity, identity)
    supported = ok
    if not supported then
        clearSourceSnapshot()
        render('{"status":"unsupported-rom"}')
        console:error(tostring(identityError))
    end
end

local function updateSourceSnapshot()
    if not supported then return end

    local ok, result = pcall(function()
        return emerald.snapshotJson(source, identity, emerald.acquire(reader))
    end)
    if not ok then
        clearSourceSnapshot()
        render('{"status":"invalid-acquisition"}')
        console:error(tostring(result))
        return
    end

    render(result)
    replaceSourceSnapshot(result)
end

callbacks:add("start", detectGame)
callbacks:add("reset", detectGame)
callbacks:add("frame", updateSourceSnapshot)

if emu then
    detectGame()
    updateSourceSnapshot()
else
    clearSourceSnapshot()
    render('{"status":"waiting-for-game"}')
end
