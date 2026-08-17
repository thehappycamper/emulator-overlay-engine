-- Provider-neutral Pokemon Emerald (English retail Rev 0) acquisition logic.
-- Emulator providers supply read8/read16/read32 functions over the GBA system
-- bus and retain ownership of emulator lifecycle, identity APIs, and file I/O.
--
-- Takes the directory containing this file's sibling data/*.lua tables (an
-- explicit argument, not derived via the `debug` library, since sandboxed
-- Lua environments are not guaranteed to expose `debug.getinfo`) as its
-- first argument: `loadfile(modulePath)(dataDir)`. Callers already know
-- this directory, since they already resolved modulePath to load this
-- file in the first place.

local dataDir = ...
if dataDir == nil or dataDir == "" then
    error("emerald-acquisition.lua requires its data directory as the first argument: loadfile(modulePath)(dataDir)")
end

local function loadData(fileName)
    local path = dataDir .. fileName
    local chunk, loadError = loadfile(path)
    if chunk == nil then
        error("Could not load Emerald reference data " .. path .. ": " .. tostring(loadError))
    end
    return chunk()
end

local SPECIES = loadData("species.lua")
local MOVES = loadData("moves.lua")
local ITEMS = loadData("items.lua")
local LOCATIONS = loadData("locations.lua")
local CHARMAP = loadData("charmap.lua")
local ENCOUNTERS = loadData("encounters.lua")
local BALLS = loadData("balls.lua")

-- BATTLE_TYPE_TRAINER (include/constants/battle.h: `#define
-- BATTLE_TYPE_TRAINER (1 << 3)`) - see reference-data.js's twin constant.
local BATTLE_TYPE_TRAINER = 1 << 3

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
    -- See emerald-us-rev0.js's twin constant for the full address-provenance note.
    saveBlock2Pointer = 0x03005D90,
}

local POKEMON = {
    structSize = 100,
    nicknameOffset = 8,
    nicknameLength = 10,
    secureDataOffset = 32,
    substructSize = 12,
    statusOffset = 80,
    levelOffset = 84,
    currentHpOffset = 86,
    maxHpOffset = 88,
    attackOffset = 90,
    defenseOffset = 92,
    speedOffset = 94,
    spAttackOffset = 96,
    spDefenseOffset = 98,
}

local SAVEBLOCK1 = {
    ewramStart = 0x02000000,
    ewramEnd = 0x02040000,
    positionXOffset = 0,
    positionYOffset = 2,
    mapGroupOffset = 4,
    mapNumberOffset = 5,
    flagsOffset = 0x1270,
    badge1ByteOffset = 268,
    badge1Bit = 7,
    badges2Through8ByteOffset = 269,
    pokeBallsOffset = 0x650,
    pokeBallsSlotCount = 16,
    pokeBallsSlotSize = 4,
}

-- See emerald-us-rev0.js's twin constant for the full field-offset note.
local SAVEBLOCK2 = {
    ewramStart = 0x02000000,
    ewramEnd = 0x02040000,
    encryptionKeyOffset = 0xAC,
}

-- See emerald-us-rev0.js's twin constant for the full gBattleMons
-- address/offset/index-order provenance note (community-maintained
-- BPEE.ld linker map, cross-checked against five already-verified
-- addresses in this same table).
local BATTLE = {
    ewramStart = 0x02000000,
    ewramEnd = 0x02040000,
    battleMonsAddress = 0x02024084,
    battleMonStructSize = 0x58,
    statStagesOffset = 0x18,
    statStageMin = 0,
    statStageDefault = 6,
    statStageMax = 12,
    playerBattlerIndex = 0,
    opponentBattlerIndex = 1,
}

-- Order of struct BattlePokemon.statStages[1..7] (index 0, HP, has no
-- stage and is skipped) - see BATTLE's own comment for the full citation.
local STAT_STAGE_FIELD_ORDER = { "atk", "def", "spe", "spa", "spd", "acc", "eva" }

-- Substructure order tables for personality % 24 (all four types). See
-- docs/tasks/P05/P05-T009.md's Implementation Notes for the full
-- cross-check of every row against pokeemerald's own GetSubstruct()
-- (src/pokemon.c) - these are a direct transcription of that table's four
-- columns, not re-derived from a partial memory of the pattern.
local GROWTH_SUBSTRUCT_INDEX = { 0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 2, 3, 1, 1, 2, 3, 2, 3, 1, 1, 2, 3, 2, 3 }
local ATTACKS_SUBSTRUCT_INDEX = { 1, 1, 2, 3, 2, 3, 0, 0, 0, 0, 0, 0, 2, 3, 1, 1, 3, 2, 2, 3, 1, 1, 3, 2 }
local MISC_SUBSTRUCT_INDEX = { 3, 2, 3, 2, 1, 1, 3, 2, 3, 2, 1, 1, 3, 2, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0 }

local function jsonString(value)
    value = tostring(value)
    value = value:gsub("\\", "\\\\")
    value = value:gsub('"', '\\"')
    value = value:gsub("\n", "\\n")
    value = value:gsub("\r", "\\r")
    value = value:gsub("\t", "\\t")
    return '"' .. value .. '"'
end

local function jsonValueOrNull(value)
    if value == nil then return "null" end
    if type(value) == "string" then return jsonString(value) end
    if type(value) == "boolean" then return tostring(value) end
    return tostring(value)
end

local function stringArrayJson(values)
    local parts = {}
    for index, value in ipairs(values or {}) do
        parts[index] = jsonString(value)
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function signed16(value)
    if value >= 0x8000 then
        return value - 0x10000
    end
    return value
end

-- Gen III text decoding: stops at the 0xFF terminator, matching the game's
-- own string-reading convention (see reference-data.js's decodeGen3Text
-- for the JS twin of this function, both driven by the same
-- pret/pokeemerald charmap.txt-derived table).
local function decodeGen3Text(bytes)
    local result = {}
    for _, byte in ipairs(bytes) do
        if byte == 0xFF then break end
        local char = CHARMAP[byte]
        if char ~= nil then
            result[#result + 1] = char
        end
    end
    return table.concat(result)
end

-- STATUS1 bitfield decoding (bit layout confirmed against
-- include/constants/battle.h - see reference-data.js's decodeStatusCondition
-- for the full citation).
local function decodeStatusCondition(status1)
    if (status1 & 0x07) ~= 0 then return "asleep" end
    if (status1 & 0x80) ~= 0 then return "badly-poisoned" end
    if (status1 & 0x08) ~= 0 then return "poisoned" end
    if (status1 & 0x10) ~= 0 then return "burned" end
    if (status1 & 0x20) ~= 0 then return "frozen" end
    if (status1 & 0x40) ~= 0 then return "paralyzed" end
    return "none"
end

-- Gender derivation (confirmed against pokemon.c's
-- GetGenderFromSpeciesAndPersonality - see reference-data.js's deriveGender).
local function deriveGender(genderRatio, personality)
    if genderRatio == nil then return nil end
    if genderRatio == 0 then return "male" end
    if genderRatio == 254 then return "female" end
    if genderRatio == 255 then return "genderless" end
    if genderRatio > (personality & 0xFF) then return "female" end
    return "male"
end

-- Max PP with PP Up bonus (confirmed against pokemon.c's
-- CalculatePPWithBonus - see reference-data.js's calculateMaxPp).
local function calculateMaxPp(basePp, ppBonuses, moveIndex)
    local bonusCount = (ppBonuses >> (2 * moveIndex)) & 0x3
    return basePp + (basePp * 20 * bonusCount) // 100
end

-- EXP-to-level curves (formulas confirmed against
-- src/data/pokemon/experience_tables.h - see reference-data.js's
-- EXP_FORMULAS for the JS twin, both computing identical integer values).
local EXP_FORMULAS = {
    ["medium-fast"] = function(n) return n * n * n end,
    ["fast"] = function(n) return (4 * n * n * n) // 5 end,
    ["slow"] = function(n) return (5 * n * n * n) // 4 end,
    ["medium-slow"] = function(n) return (6 * n * n * n) // 5 - 15 * n * n + 100 * n - 140 end,
    ["erratic"] = function(n)
        if n <= 50 then return ((100 - n) * n * n * n) // 50 end
        if n <= 68 then return ((150 - n) * n * n * n) // 100 end
        if n <= 98 then return (((1911 - 10 * n) // 3) * n * n * n) // 500 end
        return ((160 - n) * n * n * n) // 100
    end,
    ["fluctuating"] = function(n)
        if n <= 15 then return (((n + 1) // 3 + 24) * n * n * n) // 50 end
        if n <= 36 then return ((n + 14) * n * n * n) // 50 end
        return ((n // 2 + 32) * n * n * n) // 50
    end,
}

local function expForLevel(growthRate, level)
    local formula = growthRate and EXP_FORMULAS[growthRate]
    if formula == nil or level < 1 or level > 100 then return nil end
    if level == 1 then return 0 end
    local value = formula(level)
    if value < 0 then value = 0 end
    return value
end

local function expProgress(growthRate, level, exp)
    if level >= 100 then return nil end
    local currentThreshold = expForLevel(growthRate, level)
    local nextThreshold = expForLevel(growthRate, level + 1)
    if currentThreshold == nil or nextThreshold == nil or nextThreshold <= currentThreshold then
        return nil
    end
    local span = nextThreshold - currentThreshold
    local into = exp - currentThreshold
    if into < 0 then into = 0 end
    if into > span then into = span end
    return {
        expIntoLevel = into,
        expForNextLevel = span,
        percent = math.floor((into / span) * 1000 + 0.5) / 10,
    }
end

local function substructAddress(baseAddress, personality, indexTable)
    return baseAddress + POKEMON.secureDataOffset + indexTable[(personality % 24) + 1] * POKEMON.substructSize
end

-- Decodes one 100-byte Gen III Pokemon struct at `address` into a rich,
-- already-enriched (species/move/item names resolved) table. Mirrors
-- emerald-us-rev0.js's decodeGen3Pokemon field-for-field; see that file
-- for the byte-offset/substruct-layout citations this depends on.
local function readPokemon(reader, address)
    local personality = reader.read32(address)
    local otId = reader.read32(address + 4)
    local xorKey = personality ~ otId

    local growthAddr = substructAddress(address, personality, GROWTH_SUBSTRUCT_INDEX)
    local attacksAddr = substructAddress(address, personality, ATTACKS_SUBSTRUCT_INDEX)
    local miscAddr = substructAddress(address, personality, MISC_SUBSTRUCT_INDEX)

    local function decryptWord(substructAddr, offset)
        return (reader.read32(substructAddr + offset) ~ xorKey) & 0xFFFFFFFF
    end
    local function decryptHalf(substructAddr, offset)
        local wordOffset = offset - (offset % 4)
        local word = decryptWord(substructAddr, wordOffset)
        if offset % 4 == 0 then return word & 0xFFFF end
        return (word >> 16) & 0xFFFF
    end
    local function decryptByte(substructAddr, offset)
        local wordOffset = offset - (offset % 4)
        local word = decryptWord(substructAddr, wordOffset)
        local shift = (offset % 4) * 8
        return (word >> shift) & 0xFF
    end

    local speciesId = decryptHalf(growthAddr, 0)
    local heldItemId = decryptHalf(growthAddr, 2)
    local experience = decryptWord(growthAddr, 4)
    local ppBonuses = decryptByte(growthAddr, 8)

    local moves = {}
    for moveIndex = 0, 3 do
        local moveId = decryptHalf(attacksAddr, moveIndex * 2)
        local currentPp = decryptByte(attacksAddr, 8 + moveIndex)
        if moveId ~= 0 then
            local moveInfo = MOVES[moveId]
            moves[#moves + 1] = {
                id = moveId,
                name = moveInfo and moveInfo.name or nil,
                type = moveInfo and moveInfo.type or nil,
                category = moveInfo and moveInfo.category or nil,
                power = moveInfo and moveInfo.power or nil,
                accuracy = moveInfo and moveInfo.accuracy or nil,
                currentPp = currentPp,
                maxPp = moveInfo and calculateMaxPp(moveInfo.pp, ppBonuses, moveIndex) or nil,
            }
        end
    end

    local ivWord = decryptWord(miscAddr, 4)
    local ivs = {
        hp = ivWord & 0x1F,
        atk = (ivWord >> 5) & 0x1F,
        def = (ivWord >> 10) & 0x1F,
        spe = (ivWord >> 15) & 0x1F,
        spa = (ivWord >> 20) & 0x1F,
        spd = (ivWord >> 25) & 0x1F,
    }

    local nicknameBytes = {}
    for i = 0, POKEMON.nicknameLength - 1 do
        nicknameBytes[i + 1] = reader.read8(address + POKEMON.nicknameOffset + i)
    end

    local speciesInfo = SPECIES[speciesId]
    local status1 = reader.read32(address + POKEMON.statusOffset)
    local level = reader.read8(address + POKEMON.levelOffset)

    return {
        speciesId = speciesId,
        name = speciesInfo and speciesInfo.name or nil,
        nickname = decodeGen3Text(nicknameBytes),
        types = speciesInfo and speciesInfo.types or nil,
        gender = speciesInfo and deriveGender(speciesInfo.genderRatio, personality) or nil,
        level = level,
        currentHp = reader.read16(address + POKEMON.currentHpOffset),
        maxHp = reader.read16(address + POKEMON.maxHpOffset),
        status = decodeStatusCondition(status1),
        item = (heldItemId ~= 0) and ITEMS[heldItemId] or nil,
        itemId = (heldItemId ~= 0) and heldItemId or nil,
        exp = experience,
        expProgress = speciesInfo and speciesInfo.growthRate and expProgress(speciesInfo.growthRate, level, experience) or nil,
        catchRate = speciesInfo and speciesInfo.catchRate or nil,
        stats = {
            atk = reader.read16(address + POKEMON.attackOffset),
            def = reader.read16(address + POKEMON.defenseOffset),
            spe = reader.read16(address + POKEMON.speedOffset),
            spa = reader.read16(address + POKEMON.spAttackOffset),
            spd = reader.read16(address + POKEMON.spDefenseOffset),
        },
        ivs = ivs,
        moves = moves,
    }
end

-- Resolves a ball's catch-rate multiplier for the current opponent, or nil
-- when the ball's real bonus depends on undecoded state - mirrors
-- reference-data.js's resolveBallMultiplier field-for-field.
local function resolveBallMultiplier(ballInfo, opponentTypes, opponentLevel)
    if ballInfo == nil then return nil end
    if ballInfo.kind == "guaranteed" then return { guaranteed = true } end
    if ballInfo.kind == "static" then return { multiplier = ballInfo.multiplier } end
    if ballInfo.kind == "type-conditional" then
        local matches = false
        for _, matchType in ipairs(ballInfo.matchTypes or {}) do
            for _, oppType in ipairs(opponentTypes or {}) do
                if oppType == matchType then matches = true end
            end
        end
        return { multiplier = matches and ballInfo.multiplierIfMatch or ballInfo.multiplierOtherwise }
    end
    if ballInfo.kind == "level-conditional" then
        if opponentLevel == nil then return nil end
        if opponentLevel >= 40 then return { multiplier = 10 } end
        local multiplier = 40 - opponentLevel
        if multiplier < 10 then multiplier = 10 end
        return { multiplier = multiplier }
    end
    return nil -- "unavailable" - depends on undecoded state
end

-- Real Gen III catch-probability formula, transcribed field-for-field from
-- pret/pokeemerald's Cmd_handleballthrow (src/battle_script_commands.c) -
-- see reference-data.js's calculateCatchChance for the JS twin and full
-- citation, and docs/tasks/P05/P05-T011.md for the exact source lines.
local function calculateCatchChance(catchRate, ballMultiplier, maxHp, currentHp, status)
    if catchRate == nil or catchRate < 0 then return nil end
    if ballMultiplier == nil then return nil end
    if ballMultiplier.guaranteed then return 1 end
    if ballMultiplier.multiplier == nil then return nil end
    if maxHp == nil or maxHp <= 0 or currentHp == nil or currentHp < 0 then return nil end

    local odds = (catchRate * ballMultiplier.multiplier) // 10
    odds = (odds * (maxHp * 3 - currentHp * 2)) // (3 * maxHp)

    if status == "asleep" or status == "frozen" then odds = odds * 2 end
    if status == "poisoned" or status == "burned" or status == "paralyzed" or status == "badly-poisoned" then
        odds = (odds * 15) // 10
    end

    if odds > 254 then return 1 end
    if odds <= 0 then return 0 end

    local innerQuotient = 16711680 // odds
    local firstSqrt = math.floor(math.sqrt(innerQuotient))
    local b = math.floor(math.sqrt(firstSqrt))
    if b <= 0 then return 1 end

    local shakeThreshold = 1048560 // b
    if shakeThreshold > 65535 then shakeThreshold = 65535 end
    local shakeProbability = shakeThreshold / 65536
    local chance = shakeProbability ^ 4
    if chance > 1 then chance = 1 end
    return chance
end

-- Reads one battler's live stat stages from gBattleMons[battlerIndex] - see
-- emerald-us-rev0.js's readBattlerStatStages twin for the full
-- address/offset/range citation. Returns nil (not a partial table) if any
-- raw stage byte falls outside the real [0,12] range, since this is a
-- fixed global always "readable" numerically even outside battle - range
-- validation is the only fail-closed signal available here.
local function readBattlerStatStages(reader, battlerIndex)
    local battlerAddress = BATTLE.battleMonsAddress + battlerIndex * BATTLE.battleMonStructSize
    local stages = {}
    for index = 1, #STAT_STAGE_FIELD_ORDER do
        -- +1 (Lua's own +1 for 1-based STAT_STAGE_FIELD_ORDER) skips
        -- statStages[0] (STAT_HP), which carries no stage.
        local ok, raw = pcall(reader.read8, battlerAddress + BATTLE.statStagesOffset + index)
        if not ok or type(raw) ~= "number" or raw < BATTLE.statStageMin or raw > BATTLE.statStageMax then
            return nil
        end
        stages[STAT_STAGE_FIELD_ORDER[index]] = raw - BATTLE.statStageDefault
    end
    return stages
end

-- `wildOpponent` is only passed for an active, non-trainer battle - see
-- emerald-us-rev0.js's readBag twin for the full architecture rationale,
-- including why `encryptionKey` must be XORed against every raw quantity.
local function readBag(reader, saveBlock1Address, wildOpponent, encryptionKey)
    local quantityKey = encryptionKey & 0xFFFF
    local balls = {}
    for slot = 0, SAVEBLOCK1.pokeBallsSlotCount - 1 do
        local slotAddress = saveBlock1Address + SAVEBLOCK1.pokeBallsOffset + slot * SAVEBLOCK1.pokeBallsSlotSize
        local itemId = reader.read16(slotAddress)
        local rawQuantity = reader.read16(slotAddress + 2)
        local quantity = (rawQuantity ~ quantityKey) & 0xFFFF
        if itemId ~= 0 then
            local ballInfo = BALLS[itemId]
            local catchChance = nil
            if wildOpponent ~= nil and ballInfo ~= nil then
                local multiplier = resolveBallMultiplier(ballInfo, wildOpponent.types, wildOpponent.level)
                catchChance = calculateCatchChance(wildOpponent.catchRate, multiplier, wildOpponent.maxHp, wildOpponent.currentHp, wildOpponent.status)
            end
            balls[#balls + 1] = {
                id = itemId,
                name = (ballInfo and ballInfo.name) or ITEMS[itemId],
                quantity = quantity,
                catchChance = catchChance,
            }
        end
    end
    return { balls = balls }
end

local function readBadges(reader, saveBlock1Address)
    local badge1Byte = reader.read8(saveBlock1Address + SAVEBLOCK1.flagsOffset + SAVEBLOCK1.badge1ByteOffset)
    local badges28Byte = reader.read8(saveBlock1Address + SAVEBLOCK1.flagsOffset + SAVEBLOCK1.badges2Through8ByteOffset)
    local badges = { (badge1Byte >> SAVEBLOCK1.badge1Bit) & 1 == 1 }
    for bit = 0, 6 do
        badges[#badges + 1] = ((badges28Byte >> bit) & 1) == 1
    end
    return badges
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

    local slots = {}
    for slot = 0, partyCount - 1 do
        slots[#slots + 1] = readPokemon(reader, address.playerParty + slot * POKEMON.structSize)
    end

    local battleActive = (reader.read8(address.mainInBattleFlags) & 0x02) ~= 0
    local opponent = nil
    if battleActive then
        opponent = readPokemon(reader, address.enemyParty)
    end
    local typeFlags = reader.read32(address.battleTypeFlags)
    local trainerBattle = (typeFlags & BATTLE_TYPE_TRAINER) ~= 0
    local wildOpponent = (battleActive and not trainerBattle) and opponent or nil

    -- gBattleMons only holds meaningful data during an active battle (stale
    -- leftover/zeroed data otherwise), so stat stages are only ever
    -- attempted - and only ever exposed - while battleActive is true. A
    -- failed read for either battler nullifies both, matching
    -- emerald-us-rev0.js's readEmeraldAcquisition exactly.
    local playerStatStages = nil
    local opponentStatStages = nil
    if battleActive then
        -- readBattlerStatStages never throws (it uses pcall internally and
        -- returns nil on any failure) - a failed read for either battler
        -- nullifies both, matching emerald-us-rev0.js's
        -- readEmeraldAcquisition exactly.
        local playerStages = readBattlerStatStages(reader, BATTLE.playerBattlerIndex)
        local opponentStages = readBattlerStatStages(reader, BATTLE.opponentBattlerIndex)
        if playerStages ~= nil and opponentStages ~= nil then
            playerStatStages = playerStages
            opponentStatStages = opponentStages
        end
    end
    if opponent ~= nil then
        opponent.statStages = opponentStatStages
    end

    local saveBlock1 = reader.read32(address.saveBlock1Pointer)
    local locationReadable = saveBlock1 >= SAVEBLOCK1.ewramStart and saveBlock1 + 5 < SAVEBLOCK1.ewramEnd
    local badgesReadable = saveBlock1 >= SAVEBLOCK1.ewramStart
        and saveBlock1 + SAVEBLOCK1.flagsOffset + SAVEBLOCK1.badges2Through8ByteOffset < SAVEBLOCK1.ewramEnd

    -- Bag quantities are only meaningful once decrypted against
    -- SaveBlock2's own encryptionKey (see readBag) - bag decoding
    -- additionally requires SaveBlock2's pointer to resolve to a readable
    -- EWRAM address, the same fail-closed treatment badgesReadable already
    -- gives SaveBlock1.
    local saveBlock2 = 0
    local saveBlock2Readable = false
    local saveBlock2PointerOk, saveBlock2PointerValue = pcall(reader.read32, address.saveBlock2Pointer)
    if saveBlock2PointerOk and type(saveBlock2PointerValue) == "number" then
        saveBlock2 = saveBlock2PointerValue
        saveBlock2Readable = saveBlock2 >= SAVEBLOCK2.ewramStart
            and saveBlock2 + SAVEBLOCK2.encryptionKeyOffset + 4 <= SAVEBLOCK2.ewramEnd
    end
    local encryptionKey = 0
    if saveBlock2Readable then
        local encryptionKeyOk, encryptionKeyValue = pcall(
            reader.read32,
            saveBlock2 + SAVEBLOCK2.encryptionKeyOffset
        )
        if encryptionKeyOk and type(encryptionKeyValue) == "number" then
            encryptionKey = encryptionKeyValue
        else
            saveBlock2Readable = false
        end
    end
    local bagReadable = badgesReadable and saveBlock2Readable

    local location = nil
    if locationReadable then
        local mapGroup = reader.read8(saveBlock1 + 4)
        local mapNumber = reader.read8(saveBlock1 + 5)
        local locationKey = tostring(mapGroup) .. ":" .. tostring(mapNumber)
        location = {
            mapGroup = mapGroup,
            mapNumber = mapNumber,
            name = LOCATIONS[locationKey],
            x = signed16(reader.read16(saveBlock1)),
            y = signed16(reader.read16(saveBlock1 + 2)),
            encounters = ENCOUNTERS[locationKey],
        }
    end

    return {
        party = { count = partyCount, slots = slots, first = slots[1] or nil },
        battle = {
            active = battleActive,
            typeFlags = typeFlags,
            trainerBattle = trainerBattle,
            opponent = opponent,
            player = { statStages = playerStatStages },
        },
        location = location,
        badges = badgesReadable and readBadges(reader, saveBlock1) or nil,
        bag = bagReadable and readBag(reader, saveBlock1, wildOpponent, encryptionKey) or nil,
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

local function typesJson(types)
    if types == nil then return "null" end
    return stringArrayJson(types)
end

local function statsJson(stats)
    if stats == nil then return "null" end
    return string.format(
        '{"atk":%d,"def":%d,"spa":%d,"spd":%d,"spe":%d}',
        stats.atk, stats.def, stats.spa, stats.spd, stats.spe
    )
end

local function statStagesJson(statStages)
    if statStages == nil then return "null" end
    return string.format(
        '{"atk":%d,"def":%d,"spe":%d,"spa":%d,"spd":%d,"acc":%d,"eva":%d}',
        statStages.atk, statStages.def, statStages.spe, statStages.spa, statStages.spd, statStages.acc, statStages.eva
    )
end

local function moveJson(move)
    return string.format(
        '{"id":%d,"name":%s,"type":%s,"category":%s,"power":%s,"accuracy":%s,"currentPp":%d,"maxPp":%s}',
        move.id,
        jsonValueOrNull(move.name),
        jsonValueOrNull(move.type),
        jsonValueOrNull(move.category),
        jsonValueOrNull(move.power),
        jsonValueOrNull(move.accuracy),
        move.currentPp,
        jsonValueOrNull(move.maxPp)
    )
end

local function movesJson(moves)
    local parts = {}
    for index, move in ipairs(moves or {}) do
        parts[index] = moveJson(move)
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function expProgressJson(expProgressValue)
    if expProgressValue == nil then return "null" end
    return string.format(
        '{"expIntoLevel":%d,"expForNextLevel":%d,"percent":%s}',
        expProgressValue.expIntoLevel, expProgressValue.expForNextLevel, tostring(expProgressValue.percent)
    )
end

local function pokemonJson(pokemon)
    if pokemon == nil then
        return "null"
    end
    return string.format(
        '{"speciesId":%d,"name":%s,"nickname":%s,"types":%s,"gender":%s,"level":%d,"currentHp":%d,"maxHp":%d,'
            .. '"status":%s,"item":%s,"itemId":%s,"exp":%d,"expProgress":%s,"catchRate":%s,"stats":%s,"ivs":%s,"moves":%s,"statStages":%s}',
        pokemon.speciesId,
        jsonValueOrNull(pokemon.name),
        jsonString(pokemon.nickname or ""),
        typesJson(pokemon.types),
        jsonValueOrNull(pokemon.gender),
        pokemon.level,
        pokemon.currentHp,
        pokemon.maxHp,
        jsonString(pokemon.status),
        jsonValueOrNull(pokemon.item),
        jsonValueOrNull(pokemon.itemId),
        pokemon.exp,
        expProgressJson(pokemon.expProgress),
        jsonValueOrNull(pokemon.catchRate),
        statsJson(pokemon.stats),
        statsJson(pokemon.ivs),
        movesJson(pokemon.moves),
        statStagesJson(pokemon.statStages)
    )
end

local function partySlotsJson(slots)
    local parts = {}
    for index, pokemon in ipairs(slots or {}) do
        parts[index] = pokemonJson(pokemon)
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function encounterJson(encounter)
    return string.format(
        '{"method":%s,"speciesId":%d,"name":%s,"minLevel":%d,"maxLevel":%d,"rate":%s}',
        jsonString(encounter.method),
        encounter.speciesId,
        jsonValueOrNull(encounter.name),
        encounter.minLevel,
        encounter.maxLevel,
        tostring(encounter.rate)
    )
end

local function encountersJson(encounters)
    if encounters == nil then return "null" end
    local parts = {}
    for index, encounter in ipairs(encounters) do
        parts[index] = encounterJson(encounter)
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function locationJson(location)
    if location == nil then
        return "null"
    end
    return string.format(
        '{"mapGroup":%d,"mapNumber":%d,"name":%s,"x":%d,"y":%d,"encounters":%s}',
        location.mapGroup,
        location.mapNumber,
        jsonValueOrNull(location.name),
        location.x,
        location.y,
        encountersJson(location.encounters)
    )
end

local function badgesJson(badges)
    if badges == nil then return "null" end
    local parts = {}
    for index, value in ipairs(badges) do
        parts[index] = tostring(value)
    end
    return "[" .. table.concat(parts, ",") .. "]"
end

local function ballJson(ball)
    return string.format(
        '{"id":%d,"name":%s,"quantity":%d,"catchChance":%s}',
        ball.id,
        jsonValueOrNull(ball.name),
        ball.quantity,
        jsonValueOrNull(ball.catchChance)
    )
end

local function bagJson(bag)
    if bag == nil then return "null" end
    local parts = {}
    for index, ball in ipairs(bag.balls) do
        parts[index] = ballJson(ball)
    end
    return '{"balls":[' .. table.concat(parts, ",") .. "]}"
end

local function battlePlayerJson(player)
    if player == nil then return "null" end
    return '{"statStages":' .. statStagesJson(player.statStages) .. "}"
end

function M.snapshotJson(source, identity, acquisition)
    M.assertIdentity(identity)
    return string.format(
        '{"contract":{"id":%s,"version":%s},"source":%s,"game":{"gameCode":%s,"title":%s,"revision":%d,"crc32":%s},'
            .. '"party":{"count":%d,"slots":%s,"first":%s},'
            .. '"battle":{"active":%s,"typeFlags":%d,"trainerBattle":%s,"opponent":%s,"player":%s},'
            .. '"location":%s,"badges":%s,"bag":%s}',
        jsonString(M.contract.id),
        jsonString(M.contract.version),
        sourceJson(source),
        jsonString(M.identity.gameCode),
        jsonString(M.identity.title),
        M.identity.revision,
        jsonString(M.identity.crc32),
        acquisition.party.count,
        partySlotsJson(acquisition.party.slots),
        pokemonJson(acquisition.party.first),
        tostring(acquisition.battle.active),
        acquisition.battle.typeFlags,
        tostring(acquisition.battle.trainerBattle),
        pokemonJson(acquisition.battle.opponent),
        battlePlayerJson(acquisition.battle.player),
        locationJson(acquisition.location),
        badgesJson(acquisition.badges),
        bagJson(acquisition.bag)
    )
end

return M
