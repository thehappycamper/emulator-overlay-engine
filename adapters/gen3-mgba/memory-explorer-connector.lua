-- Developer-only diagnostic connector (P05-T008), mGBA variant. Mirrors
-- adapters/bizhawk/memory-explorer-connector.lua's behavior and output
-- shape, adapted to mGBA's callback-based Lua API (emu:readN, callbacks:add)
-- rather than BizHawk's blocking frame loop. See that file's header comment
-- for the full scope disclosure: this is read-only raw memory inspection
-- for development, separate from the production acquisition path in
-- adapters/gen3-mgba/emerald-acquisition.lua, with no game semantics.

local diagnosticPath = os.getenv("EMERALD_MEMORY_EXPLORER_DIAGNOSTIC_PATH")
local watchesPath = os.getenv("EMERALD_MEMORY_EXPLORER_WATCHES_PATH")
local scanStart = os.getenv("EMERALD_MEMORY_EXPLORER_SCAN_START")
local scanLength = os.getenv("EMERALD_MEMORY_EXPLORER_SCAN_LENGTH")
local MAX_SCAN_LENGTH = 4096

if diagnosticPath == nil or diagnosticPath == "" then
    error("Missing EMERALD_MEMORY_EXPLORER_DIAGNOSTIC_PATH")
end
if watchesPath == nil or watchesPath == "" then
    error("Missing EMERALD_MEMORY_EXPLORER_WATCHES_PATH")
end

local watches = assert(loadfile(watchesPath))()
local lastText = nil

local function jsonString(value)
    value = tostring(value)
    value = value:gsub("\\", "\\\\")
    value = value:gsub('"', '\\"')
    value = value:gsub("\n", "\\n")
    return '"' .. value .. '"'
end

local function safeRead(readFunc, address)
    local ok, value = pcall(readFunc, address)
    if ok then return value end
    return nil
end

local function watchJson(watch)
    local u8 = safeRead(function(a) return emu:read8(a) end, watch.address)
    local u16 = safeRead(function(a) return emu:read16(a) end, watch.address)
    local u32 = safeRead(function(a) return emu:read32(a) end, watch.address)
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
        local value = safeRead(function(a) return emu:read8(a) end, start + offset)
        bytes[offset + 1] = string.format("%02X", value or 0)
    end
    return string.format('{"start":%d,"length":%d,"bytesHex":%s}', start, length, jsonString(table.concat(bytes)))
end

local function atomicWrite(contents)
    local temporaryPath = diagnosticPath .. ".tmp"
    local file, openError = io.open(temporaryPath, "wb")
    if file == nil then
        console:error("Could not open memory explorer diagnostic temporary file: " .. tostring(openError))
        return
    end
    local wrote = file:write(contents .. "\n")
    local flushed = wrote and file:flush()
    local closed = file:close()
    if not wrote or not flushed or not closed then
        os.remove(temporaryPath)
        console:error("Could not write memory explorer diagnostic")
        return
    end
    local renamed = os.rename(temporaryPath, diagnosticPath)
    if not renamed then
        os.remove(diagnosticPath)
        renamed = os.rename(temporaryPath, diagnosticPath)
    end
    if not renamed then
        os.remove(temporaryPath)
        console:error("Could not publish memory explorer diagnostic")
    end
end

local function updateDiagnostic()
    if not emu then return end

    local ok, result = pcall(function()
        return string.format(
            '{"provider":"mgba","gameCode":%s,"gameTitle":%s,"watches":%s,"scan":%s}',
            jsonString(emu:getGameCode()),
            jsonString(emu:getGameTitle()),
            watchesJson(),
            scanJson()
        )
    end)
    if not ok then
        console:error(tostring(result))
        return
    end
    if result ~= lastText then
        atomicWrite(result)
        lastText = result
    end
end

callbacks:add("frame", updateDiagnostic)
if emu then
    updateDiagnostic()
end
