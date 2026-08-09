-- Read-only source provider for Pokemon Emerald (English retail Rev 0).
-- Load this file from mGBA 0.10.3 via Tools -> Scripting...

local SOURCE_CONTRACT_ID = "pokemon.emerald.us-rev0.mgba.acquisition"
local SOURCE_CONTRACT_VERSION = "1.0.0"
local SUPPORTED_GAME_CODE = "AGB-BPEE"
local SUPPORTED_TITLE = "POKEMON EMER"
local SUPPORTED_REVISION = 0
local SUPPORTED_CRC32 = 0x1F1C08FB

local ADDRESS = {
    battleTypeFlags = 0x02022FEC,
    playerPartyCount = 0x020244E9,
    playerParty = 0x020244EC,
    enemyParty = 0x02024744,
    mainInBattleFlags = 0x030026F9,
    saveBlock1Pointer = 0x03005D8C,
}

local POKEMON = {
    secureDataOffset = 32,
    substructSize = 12,
    levelOffset = 84,
    currentHpOffset = 86,
    maxHpOffset = 88,
}

local GROWTH_SUBSTRUCT_INDEX = {
    0, 0, 0, 0, 0, 0,
    1, 1, 2, 3, 2, 3,
    1, 1, 2, 3, 2, 3,
    1, 1, 2, 3, 2, 3,
}

local output = console:createBuffer("Emerald acquisition source")
local snapshotPath = os.getenv("EMERALD_SOURCE_SNAPSHOT_PATH")
local supported = false
local identity = nil
local lastText = nil
local lastSnapshotText = nil

local function jsonString(value)
    value = tostring(value)
    value = value:gsub("\\", "\\\\")
    value = value:gsub('"', '\\"')
    value = value:gsub("\n", "\\n")
    value = value:gsub("\r", "\\r")
    value = value:gsub("\t", "\\t")
    return '"' .. value .. '"'
end

local function checksumToU32(checksum)
    if type(checksum) ~= "string" or #checksum ~= 4 then
        return nil
    end
    local b1, b2, b3, b4 = checksum:byte(1, 4)
    return (((b1 * 256 + b2) * 256 + b3) * 256 + b4)
end

local function hex32(value)
    if value == nil then
        return "unavailable"
    end
    return string.format("%08X", value)
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
    if snapshotPath == nil or snapshotPath == "" then
        return
    end
    os.remove(snapshotPath .. ".tmp")
    os.remove(snapshotPath)
end

local function replaceSourceSnapshot(text)
    if snapshotPath == nil or snapshotPath == "" or text == lastSnapshotText then
        lastSnapshotText = text
        return true
    end

    local temporaryPath = snapshotPath .. ".tmp"
    local file, openError = io.open(temporaryPath, "wb")
    if file == nil then
        console:error("Could not open Emerald source snapshot temporary file: " .. tostring(openError))
        return false
    end

    local wrote, writeError = file:write(text .. "\n")
    local flushed, flushError = nil, nil
    if wrote then
        flushed, flushError = file:flush()
    end
    local closed, closeError = file:close()
    if not wrote or not flushed or not closed then
        os.remove(temporaryPath)
        console:error(
            "Could not write Emerald source snapshot: "
                .. tostring(writeError or flushError or closeError)
        )
        return false
    end

    local renamed, renameError = os.rename(temporaryPath, snapshotPath)
    if not renamed then
        -- Windows rename cannot replace an existing target. Removing the old
        -- complete file can create a brief missing-file window, never partial JSON.
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
        render('{"diagnosticVersion":"0.1.0","status":"waiting-for-game"}')
        return
    end

    identity = {
        gameCode = emu:getGameCode(),
        title = emu:getGameTitle(),
        revision = emu.memory.cart0:read8(0xBC),
        crc32 = checksumToU32(emu:checksum(C.CHECKSUM.CRC32)),
    }

    supported = identity.gameCode == SUPPORTED_GAME_CODE
        and identity.title == SUPPORTED_TITLE
        and identity.revision == SUPPORTED_REVISION
        and identity.crc32 == SUPPORTED_CRC32

    if not supported then
        clearSourceSnapshot()
        local message = string.format(
            '{"diagnosticVersion":"0.1.0","status":"unsupported-rom","actual":{"gameCode":%s,"title":%s,"revision":%d,"crc32":%s},"expected":{"gameCode":%s,"title":%s,"revision":%d,"crc32":"%08X"}}',
            jsonString(identity.gameCode),
            jsonString(identity.title),
            identity.revision,
            jsonString(hex32(identity.crc32)),
            jsonString(SUPPORTED_GAME_CODE),
            jsonString(SUPPORTED_TITLE),
            SUPPORTED_REVISION,
            SUPPORTED_CRC32
        )
        render(message)
        console:error("Emerald acquisition refused unsupported ROM identity")
    end
end

local function readPokemon(address)
    local personality = emu:read32(address)
    local otId = emu:read32(address + 4)
    local growthIndex = GROWTH_SUBSTRUCT_INDEX[(personality % 24) + 1]
    local encryptedGrowthWord = emu:read32(
        address + POKEMON.secureDataOffset + growthIndex * POKEMON.substructSize
    )
    local speciesId = (encryptedGrowthWord ~ personality ~ otId) & 0xFFFF

    return {
        speciesId = speciesId,
        level = emu:read8(address + POKEMON.levelOffset),
        currentHp = emu:read16(address + POKEMON.currentHpOffset),
        maxHp = emu:read16(address + POKEMON.maxHpOffset),
    }
end

local function pokemonJson(pokemon)
    if pokemon == nil then
        return "null"
    end
    return string.format(
        '{"speciesId":%d,"level":%d,"currentHp":%d,"maxHp":%d}',
        pokemon.speciesId,
        pokemon.level,
        pokemon.currentHp,
        pokemon.maxHp
    )
end

local function locationJson()
    local saveBlock1 = emu:read32(ADDRESS.saveBlock1Pointer)
    if saveBlock1 < 0x02000000 or saveBlock1 + 5 >= 0x02040000 then
        return "null"
    end

    local function signed16(value)
        if value >= 0x8000 then
            return value - 0x10000
        end
        return value
    end

    return string.format(
        '{"mapGroup":%d,"mapNumber":%d,"x":%d,"y":%d}',
        emu:read8(saveBlock1 + 4),
        emu:read8(saveBlock1 + 5),
        signed16(emu:read16(saveBlock1)),
        signed16(emu:read16(saveBlock1 + 2))
    )
end

local function updateSourceSnapshot()
    if not supported then
        return
    end

    local partyCount = emu:read8(ADDRESS.playerPartyCount)
    if partyCount > 6 then
        clearSourceSnapshot()
        render(string.format(
            '{"diagnosticVersion":"0.1.0","status":"invalid-memory","partyCount":%d}',
            partyCount
        ))
        return
    end

    local firstParty = nil
    if partyCount > 0 then
        firstParty = readPokemon(ADDRESS.playerParty)
    end

    local inBattle = (emu:read8(ADDRESS.mainInBattleFlags) & 0x02) ~= 0
    local opponent = nil
    if inBattle then
        opponent = readPokemon(ADDRESS.enemyParty)
    end

    local text = string.format(
        '{"contract":{"id":%s,"version":%s},"game":{"gameCode":%s,"title":%s,"revision":%d,"crc32":"%08X"},"party":{"count":%d,"first":%s},"battle":{"active":%s,"typeFlags":%d,"opponent":%s},"location":%s}',
        jsonString(SOURCE_CONTRACT_ID),
        jsonString(SOURCE_CONTRACT_VERSION),
        jsonString(identity.gameCode),
        jsonString(identity.title),
        identity.revision,
        identity.crc32,
        partyCount,
        pokemonJson(firstParty),
        tostring(inBattle),
        emu:read32(ADDRESS.battleTypeFlags),
        pokemonJson(opponent),
        locationJson()
    )
    render(text)
    replaceSourceSnapshot(text)
end

callbacks:add("start", detectGame)
callbacks:add("reset", detectGame)
callbacks:add("frame", updateSourceSnapshot)

if emu then
    detectGame()
    updateSourceSnapshot()
else
    clearSourceSnapshot()
    render('{"diagnosticVersion":"0.1.0","status":"waiting-for-game"}')
end
