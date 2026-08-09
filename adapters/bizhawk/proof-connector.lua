-- Generic BizHawk Proof 2 bootstrap. Game-specific expectations are supplied
-- by the launcher; this connector contains no game-state decoding.

local diagnostic_path = os.getenv("BIZHAWK_CONNECTOR_DIAGNOSTIC_PATH")
local expected_version = os.getenv("BIZHAWK_EXPECTED_VERSION")
local expected_system_id = os.getenv("BIZHAWK_EXPECTED_SYSTEM_ID")
local expected_rom_hash = os.getenv("BIZHAWK_EXPECTED_ROM_HASH")

local function require_setting(name, value)
  if value == nil or value == "" then
    error("Missing required connector environment setting: " .. name)
  end
end

require_setting("BIZHAWK_CONNECTOR_DIAGNOSTIC_PATH", diagnostic_path)
require_setting("BIZHAWK_EXPECTED_VERSION", expected_version)
require_setting("BIZHAWK_EXPECTED_SYSTEM_ID", expected_system_id)
require_setting("BIZHAWK_EXPECTED_ROM_HASH", expected_rom_hash)

local function json_string(value)
  local escaped = tostring(value):gsub('[%z\1-\31\\"]', function(character)
    local replacements = {
      ['"'] = '\\"',
      ['\\'] = '\\\\',
      ['\b'] = '\\b',
      ['\f'] = '\\f',
      ['\n'] = '\\n',
      ['\r'] = '\\r',
      ['\t'] = '\\t',
    }
    return replacements[character] or string.format("\\u%04x", string.byte(character))
  end)
  return '"' .. escaped .. '"'
end

local function atomic_write(contents)
  local temporary_path = diagnostic_path .. ".tmp"
  local file, open_error = io.open(temporary_path, "wb")
  if file == nil then
    error("Could not open BizHawk diagnostic temporary file: " .. tostring(open_error))
  end

  local wrote, write_error = file:write(contents)
  file:close()
  if wrote == nil then
    os.remove(temporary_path)
    error("Could not write BizHawk diagnostic: " .. tostring(write_error))
  end

  os.remove(diagnostic_path)
  local renamed, rename_error = os.rename(temporary_path, diagnostic_path)
  if renamed == nil then
    os.remove(temporary_path)
    error("Could not publish BizHawk diagnostic: " .. tostring(rename_error))
  end
end

local function diagnostic_json(status, message)
  return table.concat({
    "{\n",
    '  "connector": {"id": "bizhawk.lua.proof-connector", "version": "0.1.0"},\n',
    '  "status": ', json_string(status), ",\n",
    '  "message": ', json_string(message), ",\n",
    '  "emulator": {"id": "bizhawk", "version": ', json_string(client.getversion()), "},\n",
    '  "game": {"systemId": ', json_string(emu.getsystemid()),
    ', "romName": ', json_string(gameinfo.getromname()),
    ', "romHash": ', json_string(string.upper(gameinfo.getromhash())),
    ', "databaseStatus": ', json_string(gameinfo.getstatus()), "},\n",
    '  "runtime": {"frame": ', tostring(emu.framecount()), "}\n",
    "}\n",
  })
end

local actual_version = client.getversion()
local actual_system_id = emu.getsystemid()
local actual_rom_hash = string.upper(gameinfo.getromhash())

local mismatch = nil
if actual_version ~= expected_version then
  mismatch = "Unsupported BizHawk version: " .. actual_version
elseif actual_system_id ~= expected_system_id then
  mismatch = "Unsupported emulated system: " .. actual_system_id
elseif actual_rom_hash ~= string.upper(expected_rom_hash) then
  mismatch = "Unsupported game image hash: " .. actual_rom_hash
end

if mismatch ~= nil then
  atomic_write(diagnostic_json("unsupported", mismatch))
  error(mismatch)
end

local next_write_frame = -1
while true do
  local frame = emu.framecount()
  if frame >= next_write_frame or frame < next_write_frame - 60 then
    atomic_write(diagnostic_json("connected", "Supported source is running"))
    next_write_frame = frame + 60
  end
  emu.frameadvance()
end
