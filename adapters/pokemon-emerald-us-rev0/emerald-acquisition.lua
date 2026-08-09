-- Provider-neutral Pokemon Emerald (English retail Rev 0) acquisition logic.
-- Emulator providers supply read8/read16/read32 functions over the GBA system
-- bus and retain ownership of emulator lifecycle, identity APIs, and file I/O.

local M = {}

M.contract = {
    id = "pokemon.emerald.us-rev0.acquisition",
    version = "1.0.0",
}

M.identity = {
    gameCode = "AGB-BPEE",
    title = "POKEMON EMER",
    revision = 0,
    crc32 = "1F1C08FB",
    sha1 = "F3AE088181BF583E55DAF962A92BB46F4F1D07B7",
}

M.addresses = {
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

local function jsonString(value)
    value = tostring(value)
    value = value:gsub("\\", "\\\\")
    value = value:gsub('"', '\\"')
    value = value:gsub("\n", "\\n")
    value = value:gsub("\r", "\\r")
    value = value:gsub("\t", "\\t")
    return '"' .. value .. '"'
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

local function stringArrayJson(values)
    local parts = {}
    for index, value in ipairs(values or {}) do
        parts[index] = jsonString(value)
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function readPokemon(reader, address)
    local personality = reader.read32(address)
    local otId = reader.read32(address + 4)
    local growthIndex = GROWTH_SUBSTRUCT_INDEX[(personality % 24) + 1]
    local encryptedGrowthWord = reader.read32(
        address + POKEMON.secureDataOffset + growthIndex * POKEMON.substructSize
    )

    return {
        speciesId = (encryptedGrowthWord ~ personality ~ otId) & 0xFFFF,
        level = reader.read8(address + POKEMON.levelOffset),
        currentHp = reader.read16(address + POKEMON.currentHpOffset),
        maxHp = reader.read16(address + POKEMON.maxHpOffset),
    }
end

local function signed16(value)
    if value >= 0x8000 then
        return value - 0x10000
    end
    return value
end

function M.assertIdentity(identity)
    local expected = M.identity
    local crc32 = string.upper(tostring(identity and identity.crc32 or ""))
    if identity == nil
        or identity.gameCode ~= expected.gameCode
        or identity.title ~= expected.title
        or identity.revision ~= expected.revision
        or crc32 ~= expected.crc32 then
        error(string.format(
            "Unsupported Emerald ROM: expected %s Rev %d CRC32 %s",
            expected.gameCode,
            expected.revision,
            expected.crc32
        ))
    end
    return true
end

function M.acquire(reader)
    if reader == nil
        or type(reader.read8) ~= "function"
        or type(reader.read16) ~= "function"
        or type(reader.read32) ~= "function" then
        error("Emerald acquisition requires read8/read16/read32 functions")
    end

    local address = M.addresses
    local partyCount = reader.read8(address.playerPartyCount)
    if partyCount > 6 then
        error("Invalid Emerald party count: " .. tostring(partyCount))
    end

    local firstParty = nil
    if partyCount > 0 then
        firstParty = readPokemon(reader, address.playerParty)
    end

    local battleActive = (reader.read8(address.mainInBattleFlags) & 0x02) ~= 0
    local opponent = nil
    if battleActive then
        opponent = readPokemon(reader, address.enemyParty)
    end

    local saveBlock1 = reader.read32(address.saveBlock1Pointer)
    local location = nil
    if saveBlock1 >= 0x02000000 and saveBlock1 + 5 < 0x02040000 then
        location = {
            mapGroup = reader.read8(saveBlock1 + 4),
            mapNumber = reader.read8(saveBlock1 + 5),
            x = signed16(reader.read16(saveBlock1)),
            y = signed16(reader.read16(saveBlock1 + 2)),
        }
    end

    return {
        party = { count = partyCount, first = firstParty },
        battle = {
            active = battleActive,
            typeFlags = reader.read32(address.battleTypeFlags),
            opponent = opponent,
        },
        location = location,
    }
end

local function sourceJson(source)
    local providerVersion = ""
    if source.provider.version ~= nil and source.provider.version ~= "" then
        providerVersion = ',"version":' .. jsonString(source.provider.version)
    end
    return string.format(
        '{"provider":{"id":%s,"name":%s%s},"integration":%s,"memory":{"addressSpace":"gba-system-bus","primaryDomain":%s,"verifiedDomains":%s}}',
        jsonString(source.provider.id),
        jsonString(source.provider.name),
        providerVersion,
        jsonString(source.integration),
        jsonString(source.memory.primaryDomain),
        stringArrayJson(source.memory.verifiedDomains)
    )
end

local function locationJson(location)
    if location == nil then
        return "null"
    end
    return string.format(
        '{"mapGroup":%d,"mapNumber":%d,"x":%d,"y":%d}',
        location.mapGroup,
        location.mapNumber,
        location.x,
        location.y
    )
end

function M.snapshotJson(source, identity, acquisition)
    M.assertIdentity(identity)
    return string.format(
        '{"contract":{"id":%s,"version":%s},"source":%s,"game":{"gameCode":%s,"title":%s,"revision":%d,"crc32":%s},"party":{"count":%d,"first":%s},"battle":{"active":%s,"typeFlags":%d,"opponent":%s},"location":%s}',
        jsonString(M.contract.id),
        jsonString(M.contract.version),
        sourceJson(source),
        jsonString(M.identity.gameCode),
        jsonString(M.identity.title),
        M.identity.revision,
        jsonString(M.identity.crc32),
        acquisition.party.count,
        pokemonJson(acquisition.party.first),
        tostring(acquisition.battle.active),
        acquisition.battle.typeFlags,
        pokemonJson(acquisition.battle.opponent),
        locationJson(acquisition.location)
    )
end

return M
