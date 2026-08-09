-- Developer-only diagnostic connector (P05-T008). Reads a checked-in list
-- of known Emerald addresses plus an optional bounded byte-range scan and
-- publishes their current raw values as a local diagnostic JSON file for
-- the Emerald memory explorer dev tool.
--
-- This is deliberately separate from adapters/bizhawk/proof-connector.lua,
-- the production acquisition path: this script performs no strict
-- version/system/ROM-hash gating, no System-Bus-vs-direct-domain parity
-- verification, and emits no acquisition source contract. It is read-only
-- raw memory inspection for development, not a supported acquisition
-- provider - see adapters/pokemon-emerald-us-rev0's contract for that.
-- Watch labels and addresses carry no game semantics; this script does not
-- decode, decrypt, or interpret Pokemon data.

local diagnosticPath = os.getenv("EMERALD_MEMORY_EXPLORER_DIAGNOSTIC_PATH")
local watchesPath = os.getenv("EMERALD_MEMORY_EXPLORER_WATCHES_PATH")
local scanStart = os.getenv("EMERALD_MEMORY_EXPLORER_SCAN_START")
local scanLength = os.getenv("EMERALD_MEMORY_EXPLORER_SCAN_LENGTH")
local MAX_SCAN_LENGTH = 4096

local function requireSetting(name, value)
    if value == nil or value == "" then
        error("Missing required connector environment setting: " .. name)
    end
end

requireSetting("EMERALD_MEMORY_EXPLORER_DIAGNOSTIC_PATH", diagnosticPath)
requireSetting("EMERALD_MEMORY_EXPLORER_WATCHES_PATH", watchesPath)

local watches = assert(loadfile(watchesPath))()

local function jsonString(value)
    value = tostring(value)
    value = value:gsub("\\", "\\\\")
    value = value:gsub('"', '\\"')
    value = value:gsub("\n", "\\n")
    return '"' .. value .. '"'
end

local function safeRead(readFunc, address)
    local ok, value = pcall(readFunc, address, "System Bus")
    if ok then return value end
    return nil
end

local function watchJson(watch)
    local u8 = safeRead(memory.read_u8, watch.address)
    local u16 = safeRead(memory.read_u16_le, watch.address)
    local u32 = safeRead(memory.read_u32_le, watch.address)
    return string.format(
        '{"label":%s,"address":%d,"u8":%s,"u16":%s,"u32":%s}',
        jsonString(watch.label),
        watch.address,
        u8 and tostring(u8) or "null",
        u16 and tostring(u16) or "null",
        u32 and tostring(u32) or "null"
    )
end

local function watchesJson()
    local parts = {}
    for index, watch in ipairs(watches) do
        parts[index] = watchJson(watch)
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function scanJson()
    if scanStart == nil or scanLength == nil then
        return "null"
    end
    local start = tonumber(scanStart)
    local length = tonumber(scanLength)
    if start == nil or length == nil or length <= 0 then
        return "null"
    end
    if length > MAX_SCAN_LENGTH then
        length = MAX_SCAN_LENGTH
    end
    local bytes = {}
    for offset = 0, length - 1 do
        local value = safeRead(memory.read_u8, start + offset)
        bytes[offset + 1] = string.format("%02X", value or 0)
    end
    return string.format('{"start":%d,"length":%d,"bytesHex":%s}', start, length, jsonString(table.concat(bytes)))
end

local function atomicWrite(contents)
    local temporaryPath = diagnosticPath .. ".tmp"
    local file, openError = io.open(temporaryPath, "wb")
    if file == nil then
        error("Could not open memory explorer diagnostic temporary file: " .. tostring(openError))
    end
    local wrote = file:write(contents .. "\n")
    local flushed = wrote and file:flush()
    local closed = file:close()
    if not wrote or not flushed or not closed then
        os.remove(temporaryPath)
        error("Could not write memory explorer diagnostic")
    end
    os.remove(diagnosticPath)
    local renamed, renameError = os.rename(temporaryPath, diagnosticPath)
    if not renamed then
        os.remove(temporaryPath)
        error("Could not publish memory explorer diagnostic: " .. tostring(renameError))
    end
end

local nextWriteFrame = -1
while true do
    local frame = emu.framecount()
    if frame >= nextWriteFrame or frame < nextWriteFrame - 30 then
        local ok, result = pcall(function()
            return string.format(
                '{"provider":"bizhawk","emulatorVersion":%s,"systemId":%s,"romHash":%s,"frame":%d,"watches":%s,"scan":%s}',
                jsonString(client.getversion()),
                jsonString(emu.getsystemid()),
                jsonString(string.upper(gameinfo.getromhash())),
                frame,
                watchesJson(),
                scanJson()
            )
        end)
        if ok then
            atomicWrite(result)
        end
        nextWriteFrame = frame + 30
    end
    emu.frameadvance()
end
