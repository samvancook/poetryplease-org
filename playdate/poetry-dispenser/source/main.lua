-- Poetry Dispenser for Playdate.
-- Turn the crank one full turn: a capsule drops and opens into a poem.
-- React with the d-pad and buttons; the machine learns what to hand out.
--
--   Up = moved    A = like    B = meh    Down = dislike
--
-- Poems come from source/poems.json, built by
--   node scripts/dispenser-pool/build-playdate.js
-- Reactions are saved on the device with playdate.datastore.

import "CoreLibs/graphics"
import "CoreLibs/timer"

local gfx <const> = playdate.graphics
local W <const>, H <const> = 400, 240

-- ---------- data ----------
local data = json.decodeFile("poems.json")
local poems = data and data.poems or {}

local saved = playdate.datastore.read("reactions") or {}
local reactions = saved.reactions or {}   -- id -> {moved=, like=, meh=, dislike=}
local seen = saved.seen or {}             -- id -> true

-- Same blend as scripts/dispenser-pool/pool-lib.js (keep in step).
local PRIOR_WEIGHT <const> = 8
local VALUE <const> = { moved = 1, like = 2 / 3, meh = 1 / 3, dislike = 0 }

local function score(p)
  local r = reactions[p.id] or {}
  local total, count = 0, 0
  for kind, v in pairs(VALUE) do
    local n = r[kind] or 0
    total += n * v
    count += n
  end
  return (p.prior * PRIOR_WEIGHT + total) / (PRIOR_WEIGHT + count)
end

local function save()
  playdate.datastore.write({ reactions = reactions, seen = seen }, "reactions")
end

-- Pick an unseen poem, weighted toward higher scores (score squared).
local function pickPoem()
  local pool, sum = {}, 0
  for _, p in ipairs(poems) do
    if not seen[p.id] then
      local w = score(p) ^ 2 + 0.01
      sum += w
      pool[#pool + 1] = { p = p, w = w }
    end
  end
  if #pool == 0 then
    seen = {}
    return pickPoem()
  end
  local r = math.random() * sum
  for _, e in ipairs(pool) do
    r -= e.w
    if r <= 0 then return e.p end
  end
  return pool[#pool].p
end

-- Playdate text markup uses * and _; double them to print literally.
local function plain(s)
  return (s:gsub("%*", "**"):gsub("_", "__"))
end

-- ---------- state ----------
local state = "machine"      -- machine | dropping | poem | thanks
local crankTotal = 0         -- degrees turned toward the next capsule
local handleAngle = 0
local capsuleY = 0
local current = nil
local scrollY = 0
local thanksText = ""
local thanksTimer = nil
local poemShownAt = 0
local maxScroll = 0

local globeBalls = {}
math.randomseed(playdate.getSecondsSinceEpoch())
for i = 1, 14 do
  local a = math.random() * math.pi * 2
  local d = math.random() * 38
  globeBalls[i] = { x = 200 + math.cos(a) * d, y = 78 + math.sin(a) * d * 0.8, r = 7, fill = (i % 2 == 0) }
end

-- ---------- drawing ----------
local function drawMachine()
  gfx.clear(gfx.kColorWhite)
  gfx.setColor(gfx.kColorBlack)
  gfx.setLineWidth(2)

  -- globe
  gfx.drawCircleAtPoint(200, 78, 58)
  for _, b in ipairs(globeBalls) do
    if b.fill then gfx.fillCircleAtPoint(b.x, b.y, b.r) else gfx.drawCircleAtPoint(b.x, b.y, b.r) end
  end

  -- body
  gfx.drawRoundRect(150, 134, 100, 84, 6)
  gfx.drawRect(140, 218, 120, 10)
  -- chute
  gfx.drawRoundRect(186, 188, 28, 24, 4)

  -- crank handle (turns with the real crank)
  local cx, cy = 200, 160
  gfx.drawCircleAtPoint(cx, cy, 14)
  local rad = math.rad(handleAngle)
  local hx, hy = cx + math.cos(rad) * 22, cy + math.sin(rad) * 22
  gfx.drawLine(cx, cy, hx, hy)
  gfx.fillCircleAtPoint(hx, hy, 5)

  -- progress toward the next capsule
  gfx.drawRect(290, 150, 90, 8)
  gfx.fillRect(290, 150, math.floor(90 * math.min(crankTotal, 360) / 360), 8)

  gfx.drawTextAligned("*Poetry Dispenser*", 20, 14, kTextAlignment.left)
  gfx.drawTextAligned("Turn the crank", 380, 124, kTextAlignment.right)
  if playdate.isCrankDocked() then
    gfx.drawTextAligned("(undock it first)", 380, 170, kTextAlignment.right)
  end
  gfx.drawTextAligned(#poems .. " poems inside", 20, 214, kTextAlignment.left)
end

local function drawDrop()
  drawMachine()
  gfx.setColor(gfx.kColorBlack)
  gfx.fillCircleAtPoint(200, capsuleY, 9)
  gfx.setColor(gfx.kColorWhite)
  gfx.fillRect(191, capsuleY - 1, 18, 2)
  gfx.setColor(gfx.kColorBlack)
end

local function poemText(p)
  return table.concat(p.lines, "\n")
end

local function drawPoem()
  gfx.clear(gfx.kColorWhite)
  gfx.setColor(gfx.kColorBlack)
  local header = "*" .. plain(current.title) .. "*"
  gfx.drawTextInRect(header, 10, 6 - scrollY, 380, 22, nil, "...")
  gfx.drawTextInRect(plain(poemText(current)), 10, 30 - scrollY, 380, 600)
  -- footer
  gfx.fillRect(0, 218, W, 22)
  gfx.setImageDrawMode(gfx.kDrawModeFillWhite)
  gfx.drawTextInRect(plain(current.author), 8, 221, 170, 20, nil, "...")
  gfx.drawTextAligned("Up moved A like B meh Dn no", 394, 221, kTextAlignment.right)
  gfx.setImageDrawMode(gfx.kDrawModeCopy)
end

local function drawThanks()
  gfx.clear(gfx.kColorWhite)
  gfx.drawTextAligned("*" .. thanksText .. "*", 200, 100, kTextAlignment.center)
  gfx.drawTextAligned("Turn the crank for another", 200, 130, kTextAlignment.center)
end

-- ---------- flow ----------
local function dispense()
  current = pickPoem()
  state = "dropping"
  capsuleY = 150
end

local function react(kind, label)
  if state ~= "poem" or not current then return end
  local r = reactions[current.id] or {}
  r[kind] = (r[kind] or 0) + 1
  reactions[current.id] = r
  seen[current.id] = true
  save()
  thanksText = label
  state = "thanks"
  thanksTimer = playdate.timer.performAfterDelay(900, function()
    state = "machine"
    crankTotal = 0
  end)
end

function playdate.upButtonDown() react("moved", "Moved. Noted.") end
function playdate.AButtonDown() react("like", "Liked.") end
function playdate.BButtonDown() react("meh", "Meh. Fair.") end
function playdate.downButtonDown() react("dislike", "Not for you. Got it.") end

-- Simulator / no-crank fallback: hold Left or Right to turn.
local function buttonCrank()
  if playdate.buttonIsPressed(playdate.kButtonRight) then return 12 end
  if playdate.buttonIsPressed(playdate.kButtonLeft) then return -12 end
  return 0
end

function playdate.gameWillTerminate() save() end
function playdate.deviceWillSleep() save() end

function playdate.update()
  local change = playdate.getCrankChange() + buttonCrank()

  if state == "machine" then
    handleAngle = (handleAngle + change) % 360
    if change > 0 then crankTotal += change end
    if crankTotal >= 360 then dispense() end
    drawMachine()
  elseif state == "dropping" then
    capsuleY += 4
    drawDrop()
    if capsuleY >= 200 then
      state = "poem"
      scrollY = 0
      poemShownAt = playdate.getCurrentTimeMilliseconds()
      local _, textH = gfx.getTextSizeForMaxWidth(plain(poemText(current)), 380)
      maxScroll = math.max(0, 30 + textH - 214)
    end
  elseif state == "poem" then
    -- Crank scrolls long poems (most fit on one screen).
    -- Ignore the crank for a moment so the turn that dispensed doesn't scroll.
    if playdate.getCurrentTimeMilliseconds() - poemShownAt > 500 then
      scrollY = math.min(maxScroll, math.max(0, scrollY + change * 0.5))
    end
    drawPoem()
  elseif state == "thanks" then
    drawThanks()
  end

  playdate.timer.updateTimers()
end
