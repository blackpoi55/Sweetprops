// Luau snippets run inside Roblox Studio through StudioMCP's execute_luau.
// Every snippet shares PRELUDE (services + helpers) and receives its arguments as
// JSON in ARGS. Snippets return a JSON string so the server can parse the result.

const PRELUDE = String.raw`
local HttpService = game:GetService("HttpService")
local CollectionService = game:GetService("CollectionService")
local Selection = game:GetService("Selection")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local AssetService = game:GetService("AssetService")
local TAG = "Sweetprops"
local ID_ATTR = "SweetpropsId"

local function out(v) return HttpService:JSONEncode(v) end

local function newId() return string.sub(HttpService:GenerateGUID(false), 1, 8) end

local function fullPath(inst)
  local parts = {}
  local cur = inst
  while cur and cur ~= game do
    table.insert(parts, 1, cur.Name)
    cur = cur.Parent
  end
  return table.concat(parts, ".")
end

local function findById(id)
  for _, d in ipairs(workspace:GetDescendants()) do
    if d:GetAttribute(ID_ATTR) == id then return d end
  end
  return nil
end

local function findByPath(p)
  local cur = game
  for name in string.gmatch(p, "[^%.]+") do
    if cur == game and (name == "Workspace" or name == "workspace") then
      cur = workspace
    else
      cur = cur:FindFirstChild(name)
      if not cur then return nil end
    end
  end
  return cur ~= game and cur or nil
end

-- Gives an instance a stable id + tag so later calls can find it again.
local function adopt(inst)
  local id = inst:GetAttribute(ID_ATTR)
  if not id then
    id = newId()
    inst:SetAttribute(ID_ATTR, id)
  end
  if not CollectionService:HasTag(inst, TAG) then CollectionService:AddTag(inst, TAG) end
  return id
end

local function resolve(t)
  if type(t) ~= "table" then error("missing target") end
  local inst = (t.id and findById(t.id)) or (t.path and findByPath(t.path))
  if not inst then error("หาโมเดลไม่เจอ (อาจถูกลบหรือเปลี่ยนชื่อ)") end
  return inst
end

local function parts(inst)
  local list = {}
  if inst:IsA("BasePart") then table.insert(list, inst) end
  for _, d in ipairs(inst:GetDescendants()) do
    if d:IsA("BasePart") then table.insert(list, d) end
  end
  return list
end

-- Parts that actually show: skips invisible helpers (e.g. a ProceduralModel's 10-stud bounding box)
-- but keeps transparent card planes that carry a picture.
local function visible(p)
  if p.Name:sub(1, 11) == "Sweetprops_" or p.Name == "Root" then return false end
  if p.Transparency < 1 then return true end
  return p:FindFirstChildWhichIsA("Decal") ~= nil or p:FindFirstChildWhichIsA("SurfaceGui") ~= nil
end

local function bounds(inst)
  if inst:IsA("Model") then
    local cf, size = inst:GetBoundingBox()
    -- Recompute from visible parts only, in the model's own orientation.
    local rot = cf - cf.Position
    local minV, maxV, any = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge), false
    for _, p in ipairs(inst:GetDescendants()) do
      if p:IsA("BasePart") and visible(p) then
        any = true
        local half = p.Size / 2
        for _, sx in ipairs({ -1, 1 }) do for _, sy in ipairs({ -1, 1 }) do for _, sz in ipairs({ -1, 1 }) do
          local w = p.CFrame:PointToWorldSpace(Vector3.new(half.X * sx, half.Y * sy, half.Z * sz))
          local l = rot:PointToObjectSpace(w)
          minV = minV:Min(l); maxV = maxV:Max(l)
        end end end
      end
    end
    if not any then return cf, size end
    return rot + rot:PointToWorldSpace((minV + maxV) / 2), maxV - minV
  elseif inst:IsA("BasePart") then
    return inst.CFrame, inst.Size
  end
  local cf, size = CFrame.new(), Vector3.zero
  pcall(function()
    local list = parts(inst)
    if #list == 0 then return end
    local minV, maxV = Vector3.new(math.huge, math.huge, math.huge), Vector3.new(-math.huge, -math.huge, -math.huge)
    for _, p in ipairs(list) do
      local half = p.Size / 2
      for _, sx in ipairs({-1, 1}) do for _, sy in ipairs({-1, 1}) do for _, sz in ipairs({-1, 1}) do
        local w = p.CFrame:PointToWorldSpace(Vector3.new(half.X * sx, half.Y * sy, half.Z * sz))
        minV = minV:Min(w); maxV = maxV:Max(w)
      end end end
    end
    cf, size = CFrame.new((minV + maxV) / 2), maxV - minV
  end)
  return cf, size
end

local function pivotOf(inst)
  if inst:IsA("PVInstance") then return inst:GetPivot() end
  return (bounds(inst))
end

local function moveTo(inst, cf)
  if inst:IsA("PVInstance") then inst:PivotTo(cf) end
end

-- A Model with a PrimaryPart pivots via PrimaryPart.PivotOffset; WorldPivot only applies without one.
local function setPivot(model, worldCf)
  if model.PrimaryPart then
    model.PrimaryPart.PivotOffset = model.PrimaryPart.CFrame:ToObjectSpace(worldCf)
  else
    model.WorldPivot = worldCf
  end
end

-- ProceduralModels rebuild themselves from a script; turn a copy into a plain Model so it can be scaled/welded freely.
local function flatten(model)
  if not model:IsA("ProceduralModel") then return model end
  local m = Instance.new("Model")
  m.Name = model.Name
  for k, v in pairs(model:GetAttributes()) do pcall(function() m:SetAttribute(k, v) end) end
  for _, c in ipairs(model:GetChildren()) do
    if not c:IsA("LuaSourceContainer") then c.Parent = m end
  end
  model:Destroy()
  return m
end

local function v3(t) return Vector3.new(t[1], t[2], t[3]) end
local function arr(v) return { v.X, v.Y, v.Z } end

-- Ray straight down from a point, ignoring the given instance.
local function groundY(pos, ignore)
  local params = RaycastParams.new()
  params.FilterType = Enum.RaycastFilterType.Exclude
  params.FilterDescendantsInstances = ignore and { ignore } or {}
  local hit = workspace:Raycast(pos + Vector3.new(0, 200, 0), Vector3.new(0, -2000, 0), params)
  return hit and hit.Position.Y or nil
end

local function describe(inst)
  local cf, size = bounds(inst)
  local nParts, nMeshes, nScripts = 0, 0, 0
  for _, d in ipairs(inst:GetDescendants()) do
    if d:IsA("BasePart") then nParts += 1 end
    if d:IsA("MeshPart") or d:IsA("SpecialMesh") then nMeshes += 1 end
    if d:IsA("LuaSourceContainer") then nScripts += 1 end
  end
  if inst:IsA("BasePart") then nParts += 1 end
  if inst:IsA("MeshPart") then nMeshes += 1 end
  local anchored = true
  for _, p in ipairs(parts(inst)) do if not p.Anchored then anchored = false break end end
  return {
    id = inst:GetAttribute(ID_ATTR),
    name = inst.Name,
    className = inst.ClassName,
    path = fullPath(inst),
    tagged = CollectionService:HasTag(inst, TAG),
    size = arr(size),
    center = arr(cf.Position),
    parts = nParts, meshes = nMeshes, scripts = nScripts,
    anchored = anchored,
    effects = inst:GetAttribute("SweetpropsEffects"),
    prompt = inst:GetAttribute("SweetpropsPrompt"),
  }
end

local recording = nil
local function begin(name)
  local ok, id = pcall(function() return ChangeHistoryService:TryBeginRecording("Sweetprops: " .. name) end)
  recording = ok and id or nil
end
local function finish()
  if recording then pcall(function() ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit) end) end
end
`;

/** Long-bracket level that does not collide with the JSON payload. */
function longBracket(s) {
  let eq = '==';
  while (s.includes(`]${eq}]`)) eq += '=';
  return [`[${eq}[`, `]${eq}]`];
}

/** Builds a complete Luau chunk: prelude + ARGS + body wrapped in pcall. */
export function chunk(body, args = {}) {
  const json = JSON.stringify(args);
  const [open, close] = longBracket(json);
  return `${PRELUDE}
local ARGS = HttpService:JSONDecode(${open}${json}${close})
local ok, res = pcall(function()
${body}
end)
finish()
if ok then return out({ ok = true, data = res }) end
return out({ ok = false, error = tostring(res) })
`;
}

// ---------------------------------------------------------------- snippets

export const OPS = {
  /** Top-level props in Workspace (Models and loose parts). */
  list: String.raw`
  local items = {}
  for _, c in ipairs(workspace:GetChildren()) do
    if (c:IsA("Model") or c:IsA("BasePart") or c:IsA("Folder")) and not c:IsA("Terrain") and not c:IsA("Camera")
      and not (c:IsA("Model") and game:GetService("Players"):GetPlayerFromCharacter(c)) then
      if ARGS.onlyTagged ~= true or CollectionService:HasTag(c, TAG) then
        table.insert(items, describe(c))
      end
    end
  end
  return items`,

  selection: String.raw`
  local items = {}
  for _, s in ipairs(Selection:Get()) do
    if s:IsA("PVInstance") or s:IsA("Folder") then
      adopt(s)
      table.insert(items, describe(s))
    end
  end
  return items`,

  describe: String.raw`
  return describe(resolve(ARGS.target))`,

  select: String.raw`
  local inst = resolve(ARGS.target)
  Selection:Set({ inst })
  if ARGS.focus ~= false then
    local cf, size = bounds(inst)
    local cam = workspace.CurrentCamera
    local dist = math.max(size.Magnitude * 1.4, 8)
    local dir = (cam.CFrame.Position - cf.Position)
    dir = dir.Magnitude > 0.01 and dir.Unit or Vector3.new(1, 0.6, 1).Unit
    cam.CFrame = CFrame.lookAt(cf.Position + dir * dist, cf.Position)
    cam.Focus = CFrame.new(cf.Position)
  end
  return describe(inst)`,

  /** Records what is in Workspace before a generation so we can find what it added. */
  snapshot: String.raw`
  local seen = {}
  for _, c in ipairs(workspace:GetChildren()) do seen[c] = true end
  shared.SweetpropsBefore = shared.SweetpropsBefore or {}
  shared.SweetpropsBefore[ARGS.key or "default"] = seen
  return #workspace:GetChildren()`,

  /** New top-level instances since snapshot, adopted and returned. */
  diff: String.raw`
  local before = (shared.SweetpropsBefore or {})[ARGS.key or "default"] or {}
  local found = {}
  for _, c in ipairs(workspace:GetChildren()) do
    if not before[c] and (not ARGS.name or c.Name == ARGS.name) and not c:IsA("Camera") and not c:IsA("Terrain") and (c:IsA("PVInstance") or c:IsA("Folder")) then
      table.insert(found, c)
    end
  end
  local items = {}
  for _, c in ipairs(found) do
    before[c] = true -- never report the same instance twice
    adopt(c)
    if ARGS.prompt then c:SetAttribute("SweetpropsPrompt", ARGS.prompt) end
    table.insert(items, describe(c))
  end
  return items`,

  /** Top-level Workspace instances carrying (or containing) the generator's tag. */
  byTag: String.raw`
  local found, seen = {}, {}
  for _, inst in ipairs(CollectionService:GetTagged(ARGS.tag)) do
    local top = inst
    while top.Parent and top.Parent ~= workspace do top = top.Parent end
    if top.Parent == workspace and not seen[top] then
      seen[top] = true
      table.insert(found, top)
    end
  end
  local before = (shared.SweetpropsBefore or {})[ARGS.key or "default"]
  local items = {}
  for _, c in ipairs(found) do
    if before then before[c] = true end
    adopt(c)
    if ARGS.prompt then c:SetAttribute("SweetpropsPrompt", ARGS.prompt) end
    table.insert(items, describe(c))
  end
  return items`,

  /** Makes a fresh generation production-ready: Model wrapper, pivot, anchoring, collisions. */
  finalize: String.raw`
  begin("finalize")
  local inst = resolve(ARGS.target)
  local o = ARGS.options or {}
  -- Wrap loose parts in a Model so it moves/scales as one prop.
  if inst:IsA("BasePart") then
    local m = Instance.new("Model")
    m.Name = inst.Name
    m.Parent = inst.Parent
    for _, k in ipairs({ ID_ATTR, "SweetpropsPrompt" }) do
      m:SetAttribute(k, inst:GetAttribute(k)); inst:SetAttribute(k, nil)
    end
    CollectionService:RemoveTag(inst, TAG)
    inst.Parent = m
    m.PrimaryPart = inst
    inst = m
  end
  adopt(inst)
  if o.name and o.name ~= "" then inst.Name = o.name end
  for _, p in ipairs(parts(inst)) do
    if o.anchor ~= false then p.Anchored = true end
    if o.collision == "none" then p.CanCollide = false; p.CanQuery = true
    elseif o.collision == "box" and p:IsA("MeshPart") then pcall(function() p.CollisionFidelity = Enum.CollisionFidelity.Box end)
    elseif o.collision == "hull" and p:IsA("MeshPart") then pcall(function() p.CollisionFidelity = Enum.CollisionFidelity.Hull end) end
  end
  -- Pivot at bottom-center so it sits on whatever it is dropped on.
  if inst:IsA("Model") then
    local cf, size = inst:GetBoundingBox()
    if not inst.PrimaryPart then
      local biggest, vol = nil, -1
      for _, p in ipairs(parts(inst)) do
        local v = p.Size.X * p.Size.Y * p.Size.Z
        if v > vol then biggest, vol = p, v end
      end
      inst.PrimaryPart = biggest
    end
    -- Single-piece results from Roblox's mesh generator face +Z (multi-part ones face -Z like everything else);
    -- flip those so "front" means the face. Done once, remembered in an attribute.
    local meshGen = false
    if not inst:IsA("ProceduralModel") and not inst:GetAttribute("SweetpropsFacingSet") then
      local tagged, meshes = false, 0
      for _, t in ipairs(CollectionService:GetTags(inst)) do
        if t:sub(1, 10) == "Assistant-" then tagged = true end
      end
      for _, d in ipairs(inst:GetDescendants()) do if d:IsA("MeshPart") then meshes += 1 end end
      meshGen = tagged and meshes == 1
    end
    inst:SetAttribute("SweetpropsFacingSet", true)
    local current = pivotOf(inst)
    local facing = meshGen and CFrame.Angles(0, math.pi, 0) or (current - current.Position)
    setPivot(inst, CFrame.new(cf.Position - Vector3.new(0, size.Y / 2, 0)) * facing)
  end
  if o.place ~= false then
    local cam = workspace.CurrentCamera
    local _, size = bounds(inst)
    local dist = math.max(size.Magnitude * 1.2, 10) + (o.distance or 0)
    local look = cam.CFrame.LookVector
    local flat = Vector3.new(look.X, 0, look.Z)
    flat = flat.Magnitude > 0.01 and flat.Unit or Vector3.new(0, 0, -1)
    local pos = cam.CFrame.Position + flat * dist
    local y = groundY(pos, inst) or (pos.Y - 5)
    local facing = CFrame.lookAt(Vector3.new(pos.X, y, pos.Z), Vector3.new(cam.CFrame.Position.X, y, cam.CFrame.Position.Z))
    moveTo(inst, facing)
  end
  if o.select ~= false then Selection:Set({ inst }) end
  return describe(inst)`,

  placeFront: String.raw`
  begin("place in front")
  local inst = resolve(ARGS.target)
  local cam = workspace.CurrentCamera
  local _, size = bounds(inst)
  local look = cam.CFrame.LookVector
  local flat = Vector3.new(look.X, 0, look.Z)
  flat = flat.Magnitude > 0.01 and flat.Unit or Vector3.new(0, 0, -1)
  local pos = cam.CFrame.Position + flat * math.max(size.Magnitude * 1.2, 10)
  local y = groundY(pos, inst) or (pos.Y - 5)
  local cfPivot = pivotOf(inst)
  local cfB, sizeB = bounds(inst)
  local bottomOffset = (cfPivot.Position.Y - (cfB.Position.Y - sizeB.Y / 2))
  moveTo(inst, CFrame.new(pos.X, y + bottomOffset, pos.Z) * (cfPivot - cfPivot.Position))
  Selection:Set({ inst })
  return describe(inst)`,

  dropToGround: String.raw`
  begin("drop to ground")
  local inst = resolve(ARGS.target)
  local cfB, sizeB = bounds(inst)
  local bottom = cfB.Position - Vector3.new(0, sizeB.Y / 2, 0)
  local y = groundY(bottom, inst)
  if not y then error("ไม่เจอพื้นด้านล่าง") end
  moveTo(inst, pivotOf(inst) + Vector3.new(0, y - bottom.Y, 0))
  return describe(inst)`,

  /** Scales so the largest dimension equals ARGS.studs, or by ARGS.factor. */
  scale: String.raw`
  begin("scale")
  local inst = resolve(ARGS.target)
  local _, size = bounds(inst)
  local factor = ARGS.factor
  if ARGS.studs then factor = ARGS.studs / math.max(size.X, size.Y, size.Z, 0.001) end
  if not factor or factor <= 0 then error("bad scale") end
  if inst:IsA("Model") then
    inst:ScaleTo(inst:GetScale() * factor)
  elseif inst:IsA("BasePart") then
    inst.Size = inst.Size * factor
  end
  return describe(inst)`,

  rotate: String.raw`
  begin("rotate")
  local inst = resolve(ARGS.target)
  local a = ARGS.angles or { 0, 0, 0 }
  local p = pivotOf(inst)
  moveTo(inst, p * CFrame.Angles(math.rad(a[1]), math.rad(a[2]), math.rad(a[3])))
  return describe(inst)`,

  rename: String.raw`
  begin("rename")
  local inst = resolve(ARGS.target)
  inst.Name = ARGS.name
  return describe(inst)`,

  remove: String.raw`
  begin("delete")
  local inst = resolve(ARGS.target)
  inst:Destroy()
  return true`,

  color: String.raw`
  begin("color")
  local inst = resolve(ARGS.target)
  local c = Color3.fromHex(ARGS.color)
  for _, p in ipairs(parts(inst)) do
    p.Color = c
    if p:IsA("MeshPart") and ARGS.overrideTexture then p.TextureID = "" end
    local sa = p:FindFirstChildOfClass("SurfaceAppearance")
    if sa then pcall(function() sa.Color = c end) end
  end
  return describe(inst)`,

  material: String.raw`
  begin("material")
  local inst = resolve(ARGS.target)
  for _, p in ipairs(parts(inst)) do
    p.Material = Enum.Material[ARGS.material]
    p.MaterialVariant = ARGS.variant or ""
  end
  return describe(inst)`,

  physics: String.raw`
  begin("physics")
  local inst = resolve(ARGS.target)
  for _, p in ipairs(parts(inst)) do
    if ARGS.anchored ~= nil then p.Anchored = ARGS.anchored end
    if ARGS.canCollide ~= nil then p.CanCollide = ARGS.canCollide end
    if ARGS.castShadow ~= nil then p.CastShadow = ARGS.castShadow end
    if ARGS.transparency ~= nil then p.Transparency = ARGS.transparency end
    if ARGS.fidelity and p:IsA("MeshPart") then pcall(function() p.CollisionFidelity = Enum.CollisionFidelity[ARGS.fidelity] end) end
  end
  -- Unanchored props need welds so they don't fall apart.
  if ARGS.anchored == false and inst:IsA("Model") then
    local root = inst.PrimaryPart or parts(inst)[1]
    for _, p in ipairs(parts(inst)) do
      if p ~= root and not p:FindFirstChild("SweetpropsWeld") then
        local w = Instance.new("WeldConstraint")
        w.Name = "SweetpropsWeld"; w.Part0 = root; w.Part1 = p; w.Parent = p
      end
    end
  end
  return describe(inst)`,

  /** Effects: glow, sparkle, fire, smoke, outline, spin, float, pulse. */
  effect: String.raw`
  begin("effect")
  local inst = resolve(ARGS.target)
  local kind = ARGS.kind
  local name = "Sweetprops_" .. kind
  local list = HttpService:JSONDecode(inst:GetAttribute("SweetpropsEffects") or "[]")
  local function setList()
    local filtered = {}
    for _, k in ipairs(list) do if k ~= kind then table.insert(filtered, k) end end
    if ARGS.enabled ~= false then table.insert(filtered, kind) end
    inst:SetAttribute("SweetpropsEffects", #filtered > 0 and HttpService:JSONEncode(filtered) or nil)
  end
  for _, d in ipairs(inst:GetDescendants()) do if d.Name == name then d:Destroy() end end
  if ARGS.enabled == false then setList() return describe(inst) end
  local color = ARGS.color and Color3.fromHex(ARGS.color) or Color3.fromRGB(255, 214, 120)
  local root = inst:IsA("BasePart") and inst or (inst:IsA("Model") and inst.PrimaryPart) or parts(inst)[1]
  if not root then error("โมเดลนี้ไม่มี part") end
  local _, size = bounds(inst)
  local radius = math.max(size.X, size.Y, size.Z)

  local function attachmentAtCenter()
    local cf = bounds(inst)
    local a = Instance.new("Attachment")
    a.Name = name
    a.WorldCFrame = cf
    a.Parent = root
    return a
  end

  if kind == "glow" then
    local l = Instance.new("PointLight")
    l.Name = name; l.Color = color; l.Brightness = ARGS.strength or 2; l.Range = math.clamp(radius * 1.6, 6, 60); l.Shadows = true
    l.Parent = attachmentAtCenter()
    l.Parent.Name = name
  elseif kind == "sparkle" then
    local a = attachmentAtCenter()
    local e = Instance.new("ParticleEmitter")
    e.Name = name
    e.Texture = "rbxasset://textures/particles/sparkles_main.dds"
    e.Color = ColorSequence.new(color, Color3.new(1, 1, 1))
    e.LightEmission = 1
    e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(0.2, math.clamp(radius * 0.06, 0.15, 1.2)), NumberSequenceKeypoint.new(1, 0) })
    e.Transparency = NumberSequence.new(0.1, 1)
    e.Lifetime = NumberRange.new(0.8, 1.6)
    e.Rate = math.clamp(radius * 3, 6, 40)
    e.Speed = NumberRange.new(0.5, 1.5)
    e.SpreadAngle = Vector2.new(180, 180)
    e.Shape = Enum.ParticleEmitterShape.Box
    e.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
    e.Parent = a
    -- Box shape reads its size from the parent part, so emit from an invisible helper part instead.
    local helper = Instance.new("Part")
    helper.Name = name; helper.Anchored = true; helper.CanCollide = false; helper.CanQuery = false; helper.CanTouch = false
    helper.Transparency = 1; helper.CastShadow = false; helper.Size = size; helper.CFrame = (bounds(inst))
    helper.Parent = inst:IsA("Model") and inst or root
    e.Parent = helper
    a:Destroy()
  elseif kind == "fire" then
    local f = Instance.new("Fire"); f.Name = name; f.Color = color; f.SecondaryColor = Color3.fromRGB(255, 90, 40)
    f.Size = math.clamp(radius * 0.6, 2, 30); f.Heat = 9; f.Parent = attachmentAtCenter().Parent
  elseif kind == "smoke" then
    local s = Instance.new("Smoke"); s.Name = name; s.Color = color; s.Opacity = 0.15; s.RiseVelocity = 3
    s.Size = math.clamp(radius * 0.4, 1, 20); s.Parent = root
  elseif kind == "outline" then
    local h = Instance.new("Highlight"); h.Name = name; h.FillTransparency = 1; h.OutlineColor = color
    h.DepthMode = Enum.HighlightDepthMode.Occluded; h.Parent = inst
  elseif kind == "neon" then
    -- Turns the smallest ~20% of parts into neon accents.
    local list2 = parts(inst)
    table.sort(list2, function(a, b) return a.Size.Magnitude < b.Size.Magnitude end)
    for i = 1, math.max(1, math.floor(#list2 * 0.2)) do
      local p = list2[i]
      p:SetAttribute("SweetpropsOldMaterial", p.Material.Name)
      p.Material = Enum.Material.Neon; p.Color = color
    end
  elseif kind == "petals" or kind == "hearts" or kind == "aura" then
    -- Emits from an invisible box covering the prop; petals drift down and spin, hearts float up, aura glows softly.
    local helper = Instance.new("Part")
    helper.Name = name; helper.Anchored = true; helper.CanCollide = false; helper.CanQuery = false; helper.CanTouch = false
    helper.Transparency = 1; helper.CastShadow = false; helper.Massless = true
    helper.Size = size * (kind == "aura" and 0.8 or 1); helper.CFrame = (bounds(inst))
    helper.Parent = inst:IsA("Model") and inst or root
    local e = Instance.new("ParticleEmitter")
    e.Name = name
    e.Shape = Enum.ParticleEmitterShape.Box
    e.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
    e.Texture = ARGS.texture or "rbxasset://textures/particles/sparkles_main.dds"
    e.LightEmission = kind == "petals" and 0.35 or 0.8
    e.Color = ColorSequence.new(color)
    if kind == "petals" then
      e.Size = NumberSequence.new(math.clamp(radius * 0.035, 0.12, 0.8))
      e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.15, 0.05), NumberSequenceKeypoint.new(0.8, 0.1), NumberSequenceKeypoint.new(1, 1) })
      e.Lifetime = NumberRange.new(3, 5)
      e.Rate = math.clamp(radius * 1.5, 4, 25)
      e.Speed = NumberRange.new(0.3, 1)
      e.Acceleration = Vector3.new(0.4, -1.2, 0)
      e.Drag = 0.6
      e.Rotation = NumberRange.new(0, 360)
      e.RotSpeed = NumberRange.new(-120, 120)
      e.SpreadAngle = Vector2.new(60, 60)
    elseif kind == "hearts" then
      e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(0.2, math.clamp(radius * 0.05, 0.2, 1.2)), NumberSequenceKeypoint.new(1, 0) })
      e.Transparency = NumberSequence.new(0.1, 1)
      e.Lifetime = NumberRange.new(1.5, 2.5)
      e.Rate = math.clamp(radius * 0.8, 2, 12)
      e.Speed = NumberRange.new(0.5, 1.2)
      e.Acceleration = Vector3.new(0, 1, 0)
      e.SpreadAngle = Vector2.new(30, 30)
    else
      e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(0.3, math.clamp(radius * 0.12, 0.6, 4)), NumberSequenceKeypoint.new(1, 0) })
      e.Transparency = NumberSequence.new(0.6, 1)
      e.Lifetime = NumberRange.new(1.2, 2)
      e.Rate = math.clamp(radius * 2, 6, 30)
      e.Speed = NumberRange.new(0, 0.3)
      e.LightInfluence = 0
    end
    e.Parent = helper
  elseif kind == "spin" or kind == "float" or kind == "pulse" then
    local s = Instance.new("Script")
    s.Name = name
    local speed = ARGS.speed or 1
    local src = {
      spin = "local m=script.Parent local base=m:GetPivot() local t=0 game:GetService('RunService').Heartbeat:Connect(function(dt) t+=dt m:PivotTo(base*CFrame.Angles(0,t*%s,0)) end)",
      float = "local m=script.Parent local base=m:GetPivot() local t=0 game:GetService('RunService').Heartbeat:Connect(function(dt) t+=dt m:PivotTo(base+Vector3.new(0,math.sin(t*%s*2)*0.5,0)) end)",
      pulse = "local m=script.Parent local base=m:GetScale() local t=0 game:GetService('RunService').Heartbeat:Connect(function(dt) t+=dt m:ScaleTo(base*(1+math.sin(t*%s*3)*0.05)) end)",
    }
    s.Source = "-- Sweetprops " .. kind .. " effect (runs in play mode)\n" .. string.format(src[kind], tostring(speed))
    if not inst:IsA("Model") then error("เอฟเฟกต์เคลื่อนไหวต้องใช้กับ Model (กด 'จัดให้พร้อมใช้' ก่อน)") end
    s.Parent = inst
  else
    error("unknown effect " .. tostring(kind))
  end
  setList()
  return describe(inst)`,

  /** Smart materials by part name: gold for metal bits, glowing glass for gems, fabric for cloth. */
  restyle: String.raw`
  begin("pro materials")
  local inst = resolve(ARGS.target)
  local pal = ARGS.palette or {}
  local metal = Color3.fromHex(pal.metal or "#e9b949")
  local gem = Color3.fromHex(pal.accent or "#ff5fa2")
  local mode = ARGS.mode or "smart"
  local function has(s, words)
    for _, w in ipairs(words) do if string.find(s, w, 1, true) then return true end end
    return false
  end
  local METAL = { "gold", "chain", "frame", "filigree", "crown", "trim", "metal", "ring", "hinge", "handle", "rim", "buckle", "lock", "silver", "iron", "bronze", "ornament", "swirl" }
  local GEM = { "gem", "crystal", "diamond", "jewel", "pendant", "heart", "orb", "glass", "ice", "ruby", "sapphire", "emerald", "amethyst" }
  local CLOTH = { "ribbon", "bow", "cloth", "fabric", "cape", "banner", "curtain", "sash", "flag", "cushion", "pillow", "rope" }
  local SOFT = { "wing", "feather", "fur", "hair", "petal", "flower", "sakura", "blossom", "leaf", "leaves" }
  local counts = { metal = 0, gem = 0, cloth = 0, soft = 0 }
  for _, p in ipairs(parts(inst)) do
    local helper = p.Name:sub(1, 11) == "Sweetprops_" or p:FindFirstAncestor("Sweetprops_pendants")
    if not helper and p.Transparency < 1 then
      local n = string.lower(p.Name .. " " .. (p.Parent and p.Parent.Name or ""))
      if has(n, GEM) then
        if p:IsA("MeshPart") then p.TextureID = "" end
        p.Material = Enum.Material.Glass
        p.Color = gem
        p.Transparency = 0.12
        p.Reflectance = 0.3
        p.CastShadow = false
        if not p:FindFirstChild("Sweetprops_gemglow") then
          local l = Instance.new("PointLight")
          l.Name = "Sweetprops_gemglow"; l.Color = gem; l.Brightness = 1.2
          l.Range = math.clamp(p.Size.Magnitude * 2.5, 3, 14); l.Parent = p
        end
        counts.gem += 1
      elseif has(n, METAL) then
        if p:IsA("MeshPart") then p.TextureID = "" end
        p.Material = Enum.Material.Metal
        p.Color = metal
        p.Reflectance = 0.12
        counts.metal += 1
      elseif has(n, CLOTH) then
        p.Material = Enum.Material.Fabric
        counts.cloth += 1
      elseif has(n, SOFT) then
        p.Material = Enum.Material.SmoothPlastic
        counts.soft += 1
      end
    end
  end
  -- Repaint mode: tint every remaining textured part toward the reference palette (detail is kept).
  if mode == "repaint" and pal.primary then
    local tintColor = Color3.fromHex(pal.tint or pal.primary)
    for _, p in ipairs(parts(inst)) do
      if p:IsA("MeshPart") and p.TextureID ~= "" and p.Name:sub(1, 11) ~= "Sweetprops_" then
        local sa = p:FindFirstChild("SweetpropsTint")
        if not sa then
          sa = Instance.new("SurfaceAppearance"); sa.Name = "SweetpropsTint"; sa.ColorMap = p.TextureID; sa.Parent = p
        end
        sa.Color = tintColor
      end
    end
  end
  local d = describe(inst)
  d.restyled = counts
  return d`,

  /** Replaces one colour with another on every part close to it (e.g. yellow → tiger orange); keeps other colours. */
  replaceColor: String.raw`
  begin("replace color")
  local inst = resolve(ARGS.target)
  local from, to = Color3.fromHex(ARGS.from), Color3.fromHex(ARGS.to)
  local tol = (ARGS.tolerance or 60) / 255
  local n = 0
  local function close(c)
    return math.sqrt((c.R - from.R) ^ 2 + (c.G - from.G) ^ 2 + (c.B - from.B) ^ 2) <= tol
  end
  for _, p in ipairs(parts(inst)) do
    if p.Name:sub(1, 11) ~= "Sweetprops_" and close(p.Color) then p.Color = to; n += 1 end
  end
  local d = describe(inst)
  d.replaced = n
  return d`,

  /** Distinct colours used by the prop's parts, most common first (for the replace-colour picker). */
  colors: String.raw`
  local inst = resolve(ARGS.target)
  local counts = {}
  for _, p in ipairs(parts(inst)) do
    if p.Name:sub(1, 11) ~= "Sweetprops_" and p.Transparency < 1 then
      local h = p.Color:ToHex()
      counts[h] = (counts[h] or 0) + p.Size.X * p.Size.Y * p.Size.Z
    end
  end
  local list = {}
  for h, v in pairs(counts) do table.insert(list, { hex = "#" .. h, weight = v }) end
  table.sort(list, function(a, b) return a.weight > b.weight end)
  local out = {}
  for i = 1, math.min(#list, 12) do out[i] = list[i].hex end
  return out`,

  /** Tints generated textures (keeps all painted detail) via SurfaceAppearance.Color; color = nil removes the tint. */
  tint: String.raw`
  begin("tint")
  local inst = resolve(ARGS.target)
  local c = ARGS.color and Color3.fromHex(ARGS.color)
  local only = ARGS.only -- optional list of name keywords
  local n = 0
  for _, p in ipairs(parts(inst)) do
    if p:IsA("MeshPart") and p.Name:sub(1, 11) ~= "Sweetprops_" then
      local name = string.lower(p.Name .. " " .. (p.Parent and p.Parent.Name or ""))
      local ok = not only
      if only then for _, w in ipairs(only) do if string.find(name, w, 1, true) then ok = true end end end
      if ok then
        local sa = p:FindFirstChild("SweetpropsTint")
        if not c then
          if sa then sa:Destroy() end
        elseif p.TextureID ~= "" or sa then
          if not sa then
            sa = Instance.new("SurfaceAppearance")
            sa.Name = "SweetpropsTint"
            sa.ColorMap = p.TextureID
            sa.Parent = p
          end
          sa.Color = c
          n += 1
        end
      end
    end
  end
  local d = describe(inst)
  d.tinted = n
  return d`,

  /** Hangs chain + crystal pendants under the lower edge of the prop (found by raycasting up into it). */
  hangPendants: String.raw`
  begin("hang pendants")
  local inst = resolve(ARGS.target)
  local old = inst:FindFirstChild("Sweetprops_pendants")
  if old then old:Destroy() end
  if ARGS.clear then return describe(inst) end
  local cf, size = bounds(inst)
  local n = math.clamp(ARGS.count or 9, 1, 60)
  local metal = Color3.fromHex(ARGS.metal or "#e9b949")
  local gemColor = Color3.fromHex(ARGS.color or "#ff5fa2")
  local scale = math.max(size.X, size.Y) * (ARGS.size or 1)
  local targets = {}
  for _, p in ipairs(parts(inst)) do
    if p.Name:sub(1, 11) ~= "Sweetprops_" and p.Transparency < 1 then table.insert(targets, p) end
  end
  local params = RaycastParams.new()
  params.FilterType = Enum.RaycastFilterType.Include
  params.FilterDescendantsInstances = targets
  local rng = Random.new(ARGS.seed or 7)
  local folder = Instance.new("Model")
  folder.Name = "Sweetprops_pendants"
  local function part(name, sz, cframe, color, mat)
    local p = Instance.new("Part")
    p.Name = name; p.Size = sz; p.CFrame = cframe; p.Color = color; p.Material = mat
    p.Anchored = true; p.CanCollide = false; p.CanTouch = false; p.CanQuery = false; p.CastShadow = false
    p.TopSurface = Enum.SurfaceType.Smooth; p.BottomSurface = Enum.SurfaceType.Smooth
    p.Parent = folder
    return p
  end
  local made = 0
  local up = cf.UpVector
  for i = 1, n do
    local t = (i - 0.5) / n
    local x = (t - 0.5) * size.X * 0.92
    local hit
    for _, z in ipairs({ 0, size.Z * 0.2, -size.Z * 0.2 }) do
      local origin = cf:PointToWorldSpace(Vector3.new(x, -size.Y / 2 - 0.5, z))
      hit = workspace:Raycast(origin, up * (size.Y + 1), params)
      if hit then break end
    end
    if hit then
      local top = hit.Position
      local len = scale * (ARGS.length or 0.12) * rng:NextNumber(0.6, 1.4)
      local w = math.max(scale * 0.006, 0.03)
      local mid = top - up * (len / 2)
      local chain = part("Chain", Vector3.new(len, w, w), CFrame.fromMatrix(mid, up, cf.LookVector:Cross(up)), metal, Enum.Material.Metal)
      chain.Shape = Enum.PartType.Cylinder
      local g = scale * 0.05 * rng:NextNumber(0.8, 1.2)
      local bottom = top - up * len
      local cap = part("Cap", Vector3.new(g * 0.45, g * 0.45, g * 0.45), CFrame.new(bottom), metal, Enum.Material.Metal)
      cap.Shape = Enum.PartType.Ball
      local gemPart = part("Gem", Vector3.new(g, g * 1.8, g), cf.Rotation + (bottom - up * (g * 0.9)), gemColor, Enum.Material.Glass)
      local mesh = Instance.new("SpecialMesh")
      mesh.MeshType = Enum.MeshType.Sphere
      mesh.Parent = gemPart
      gemPart.Transparency = 0.1; gemPart.Reflectance = 0.35
      made += 1
    end
  end
  if made == 0 then folder:Destroy() error("หาขอบล่างของโมเดลไม่เจอ ลองกด 'จัดให้พร้อมใช้' ก่อน") end
  folder.Parent = inst
  local d = describe(inst)
  d.pendants = made
  return d`,

  /** Places small decorations (flower/heart/pearl/gem) on the front surface, aligned to the surface normal. */
  decorate: String.raw`
  begin("decorate")
  local inst = resolve(ARGS.target)
  local kind = ARGS.kind or "flower"
  local fname = "Sweetprops_decor_" .. kind
  local old = inst:FindFirstChild(fname)
  if old then old:Destroy() end
  if ARGS.clear then return describe(inst) end
  local cf, size = bounds(inst)
  local n = math.clamp(ARGS.count or 14, 1, 120)
  local c1 = Color3.fromHex(ARGS.color or "#ffb3cf")
  local c2 = Color3.fromHex(ARGS.color2 or "#ffd36b")
  local s = math.max(size.X, size.Y) * 0.035 * (ARGS.size or 1)
  local targets = {}
  for _, p in ipairs(parts(inst)) do
    local helper = p.Name:sub(1, 11) == "Sweetprops_" or p:FindFirstAncestor("Sweetprops_pendants")
    for _, c in ipairs(inst:GetChildren()) do
      if c.Name:sub(1, 17) == "Sweetprops_decor_" and p:IsDescendantOf(c) then helper = true end
    end
    if not helper and p.Transparency < 1 then table.insert(targets, p) end
  end
  local params = RaycastParams.new()
  params.FilterType = Enum.RaycastFilterType.Include
  params.FilterDescendantsInstances = targets
  local rng = Random.new(ARGS.seed or 11)
  local folder = Instance.new("Model")
  folder.Name = fname
  local function piece(parent, sz, cframe, color, mat, shape)
    local p = Instance.new("Part")
    p.Size = sz; p.CFrame = cframe; p.Color = color; p.Material = mat or Enum.Material.SmoothPlastic
    p.Anchored = true; p.CanCollide = false; p.CanTouch = false; p.CanQuery = false; p.CastShadow = false
    if shape then p.Shape = shape end
    p.Parent = parent
    return p
  end
  local function round(p)
    local m = Instance.new("SpecialMesh"); m.MeshType = Enum.MeshType.Sphere; m.Parent = p
  end
  local made, tries = 0, 0
  local around = ARGS.around or kind == "stripe"
  local onColor = ARGS.onColor and Color3.fromHex(ARGS.onColor)
  local function colorOk(part)
    if not onColor then return true end
    local c = part.Color
    return math.sqrt((c.R - onColor.R) ^ 2 + (c.G - onColor.G) ^ 2 + (c.B - onColor.B) ^ 2) < 0.28
  end
  local reach = math.max(size.X, size.Z) + 4
  while made < n and tries < n * 15 do
    tries += 1
    local dir
    local origin
    local ly = rng:NextNumber(-0.45, 0.45) * size.Y
    if around then
      local a = rng:NextNumber(0, math.pi * 2)
      dir = cf:VectorToWorldSpace(Vector3.new(math.cos(a), 0, math.sin(a)))
      origin = cf:PointToWorldSpace(Vector3.new(0, ly, 0)) + dir * reach
    else
      dir = cf.LookVector
      origin = cf:PointToWorldSpace(Vector3.new(rng:NextNumber(-0.48, 0.48) * size.X, ly, 0)) + dir * (size.Z + 2)
    end
    local hit = workspace:Raycast(origin, -dir * (reach * 2), params)
    if hit and colorOk(hit.Instance) then
      local g = Instance.new("Model"); g.Name = kind
      local normal = hit.Normal
      local base
      if kind == "stripe" then
        -- Long axis stays roughly horizontal, like painted tiger stripes.
        base = CFrame.lookAt(hit.Position + normal * (s * 0.04), hit.Position + normal * 2, Vector3.yAxis) * CFrame.Angles(0, 0, math.rad(rng:NextNumber(-22, 22)))
      else
        base = CFrame.lookAt(hit.Position + normal * (s * 0.15), hit.Position + normal * 2) * CFrame.Angles(0, 0, rng:NextNumber(0, math.pi * 2))
      end
      local k = s * rng:NextNumber(0.75, 1.25)
      if kind == "stripe" then
        local p = piece(g, Vector3.new(k * 2.6, k * 0.42, k * 0.12), base, c1); round(p)
      elseif kind == "flower" then
        for i = 1, 5 do
          local a = (i / 5) * math.pi * 2
          local petal = piece(g, Vector3.new(k * 0.55, k * 0.75, k * 0.12), base * CFrame.Angles(0, 0, a) * CFrame.new(0, k * 0.42, 0), c1)
          round(petal)
        end
        piece(g, Vector3.new(k * 0.3, k * 0.3, k * 0.3), base * CFrame.new(0, 0, -k * 0.06), c2, Enum.Material.SmoothPlastic, Enum.PartType.Ball)
      elseif kind == "heart" then
        local a = piece(g, Vector3.new(k * 0.62, k * 0.62, k * 0.25), base * CFrame.new(-k * 0.2, k * 0.12, 0), c1, Enum.Material.Glass); round(a)
        local b = piece(g, Vector3.new(k * 0.62, k * 0.62, k * 0.25), base * CFrame.new(k * 0.2, k * 0.12, 0), c1, Enum.Material.Glass); round(b)
        piece(g, Vector3.new(k * 0.6, k * 0.6, k * 0.22), base * CFrame.new(0, -k * 0.14, 0) * CFrame.Angles(0, 0, math.rad(45)), c1, Enum.Material.Glass)
        for _, p in ipairs(g:GetChildren()) do p.Reflectance = 0.25 end
      elseif kind == "pearl" then
        local p = piece(g, Vector3.new(k * 0.45, k * 0.45, k * 0.45), base, c2, Enum.Material.SmoothPlastic, Enum.PartType.Ball)
        p.Reflectance = 0.2
      else
        local p = piece(g, Vector3.new(k * 0.5, k * 0.8, k * 0.3), base, c1, Enum.Material.Glass); round(p)
        p.Reflectance = 0.35; p.Transparency = 0.1
      end
      g.Parent = folder
      made += 1
    end
  end
  if made == 0 then folder:Destroy() error("หาผิวด้านหน้าของโมเดลไม่เจอ") end
  folder.Parent = inst
  local d = describe(inst)
  d.decorated = made
  return d`,

  /** Lines several props up in front of the camera, side by side, all facing it. */
  arrange: String.raw`
  begin("arrange")
  local list = {}
  for _, t in ipairs(ARGS.targets) do table.insert(list, resolve(t)) end
  local cam = workspace.CurrentCamera
  local look = cam.CFrame.LookVector
  local flatLook = Vector3.new(look.X, 0, look.Z)
  flatLook = flatLook.Magnitude > 0.01 and flatLook.Unit or Vector3.new(0, 0, -1)
  local right = flatLook:Cross(Vector3.yAxis)
  local widths, total, maxSize = {}, 0, 0
  for i, inst in ipairs(list) do
    local _, size = bounds(inst)
    widths[i] = math.max(size.X, size.Z)
    total += widths[i]
    maxSize = math.max(maxSize, size.Magnitude)
  end
  local gap = math.max(maxSize * 0.25, 2)
  total += gap * (#list - 1)
  local center = cam.CFrame.Position + flatLook * (math.max(maxSize * 1.2, 10) + total * 0.35)
  local x = -total / 2
  for i, inst in ipairs(list) do
    x += widths[i] / 2
    local pos = center + right * x
    local y = groundY(pos, inst) or (pos.Y - 5)
    local cfPivot = pivotOf(inst)
    local cfB, sizeB = bounds(inst)
    local bottomOffset = cfPivot.Position.Y - (cfB.Position.Y - sizeB.Y / 2)
    local target = Vector3.new(pos.X, y + bottomOffset, pos.Z)
    local camFlat = Vector3.new(cam.CFrame.Position.X, target.Y, cam.CFrame.Position.Z)
    moveTo(inst, CFrame.lookAt(target, camFlat))
    x += widths[i] / 2 + gap
  end
  Selection:Set(list)
  local out = {}
  for _, inst in ipairs(list) do table.insert(out, describe(inst)) end
  return out`,

  /**
   * 2.5D "card" prop from the user's own picture: transparent image halves on thin planes folded into a V,
   * so the front view matches the reference exactly. Back faces get the opposite half so the back view lines up.
   */
  card: String.raw`
  begin("card prop")
  local A = ARGS
  local m = Instance.new("Model")
  m.Name = A.name or "CardProp"
  local W = A.width or 8
  local H = W / math.max(A.aspect or 1, 0.05)
  local cam = workspace.CurrentCamera
  local look = cam.CFrame.LookVector
  local flat = Vector3.new(look.X, 0, look.Z)
  flat = flat.Magnitude > 0.01 and flat.Unit or Vector3.new(0, 0, -1)
  local pos = cam.CFrame.Position + flat * math.max(W * 1.4, 12)
  local y = groundY(pos, nil) or (pos.Y - 5)
  local base = CFrame.lookAt(Vector3.new(pos.X, y, pos.Z), Vector3.new(cam.CFrame.Position.X, y, cam.CFrame.Position.Z))
  local function plane(name, w, h, front, back, cf)
    local p = Instance.new("Part")
    p.Name = name
    p.Size = Vector3.new(w, h, 0.05)
    p.CFrame = cf
    p.Transparency = 1
    p.Anchored = true
    p.CanCollide = false
    p.CanTouch = false
    p.CastShadow = false
    p.Massless = true
    local d1 = Instance.new("Decal"); d1.Name = "FrontImage"; d1.Texture = front; d1.Face = Enum.NormalId.Front; d1.Parent = p
    local d2 = Instance.new("Decal"); d2.Name = "BackImage"; d2.Texture = back or front; d2.Face = Enum.NormalId.Back; d2.Parent = p
    p.Parent = m
    return p
  end
  local lift = base * CFrame.new(0, H / 2, 0)
  if A.split and A.left and A.right then
    -- The model faces the viewer, so its local +X is the viewer's left: the image's left half goes on +X.
    -- Outer edges fold away from the viewer (+Z) to give the V shape depth.
    local th = math.rad(A.angle or 18)
    plane("LeftHalf", W / 2, H, A.left, A.right, lift * CFrame.Angles(0, -th, 0) * CFrame.new(W / 4, 0, 0))
    plane("RightHalf", W / 2, H, A.right, A.left, lift * CFrame.Angles(0, th, 0) * CFrame.new(-W / 4, 0, 0))
  else
    plane("Card", W, H, A.full, A.full, lift)
  end
  -- Invisible root facing the viewer: keeps the model's bounding box and pivot aligned with the picture.
  local root = Instance.new("Part")
  root.Name = "Root"; root.Size = Vector3.new(0.2, 0.2, 0.2); root.CFrame = base
  root.Transparency = 1; root.Anchored = true; root.CanCollide = false; root.CanTouch = false; root.CanQuery = false; root.Massless = true
  root.Parent = m
  m.PrimaryPart = root
  m.Parent = workspace
  adopt(m)
  m:SetAttribute("SweetpropsCard", true)
  if A.prompt then m:SetAttribute("SweetpropsPrompt", A.prompt) end
  return describe(m)`,

  /** Turns a prop into a wearable Accessory (welded to an invisible Handle) and optionally puts it on a rig. */
  toAccessory: String.raw`
  begin("make accessory")
  local inst = resolve(ARGS.target)
  local slot = ARGS.slot or "BodyBackAttachment"
  local facing = pivotOf(inst) - pivotOf(inst).Position
  local copy = flatten(inst:Clone())
  copy:SetAttribute(ID_ATTR, nil)
  -- Optional resize so it fits a character (e.g. wings ~6 studs wide).
  if ARGS.width and copy:IsA("Model") then
    local _, s0 = bounds(copy)
    copy:ScaleTo(copy:GetScale() * (ARGS.width / math.max(s0.X, s0.Z, 0.01)))
  end
  local cf, size = bounds(copy)
  local acc = Instance.new("Accessory")
  acc.Name = inst.Name
  local handle = Instance.new("Part")
  handle.Name = "Handle"
  handle.Size = Vector3.new(1, 1, 1)
  handle.Transparency = 1
  handle.CanCollide = false
  handle.CanTouch = false
  handle.CanQuery = false
  handle.Massless = true
  handle.Anchored = false
  -- Wings sit a little above centre and slightly behind the body.
  local handleCf = CFrame.new(cf.Position) * facing
  handle.CFrame = handleCf
  handle.Parent = acc
  local att = Instance.new("Attachment")
  att.Name = slot
  local offsets = {
    BodyBackAttachment = Vector3.new(0, -(ARGS.raise or size.Y * 0.12), -(ARGS.back or 0.35)),
    HatAttachment = Vector3.new(0, -size.Y * 0.4, 0),
    WaistBackAttachment = Vector3.new(0, 0, -0.3),
  }
  -- Attachment.Position is where the body attachment will snap; negative Z = in front of the prop (towards the body).
  att.Position = offsets[slot] or Vector3.zero
  att.Parent = handle
  for _, d in ipairs(copy:GetDescendants()) do
    if d:IsA("LuaSourceContainer") then d:Destroy() end
  end
  local list = {}
  if copy:IsA("BasePart") then table.insert(list, copy) end
  for _, d in ipairs(copy:GetDescendants()) do if d:IsA("BasePart") then table.insert(list, d) end end
  for _, p in ipairs(list) do
    p.Anchored = false
    p.CanCollide = false
    p.CanTouch = false
    p.Massless = true
    p.CastShadow = false
    local w = Instance.new("WeldConstraint")
    w.Part0 = handle
    w.Part1 = p
    w.Parent = handle
  end
  for _, c in ipairs(copy:IsA("BasePart") and { copy } or copy:GetChildren()) do c.Parent = acc end
  if not copy:IsA("BasePart") then copy:Destroy() end
  local rig = ARGS.rig and findByPath(ARGS.rig)
  local humanoid = rig and rig:FindFirstChildOfClass("Humanoid")
  if humanoid then
    -- Remove an earlier version of the same accessory first.
    local old = rig:FindFirstChild(acc.Name)
    if old and old:IsA("Accessory") then old:Destroy() end
    humanoid:AddAccessory(acc)
  else
    local folder = game:GetService("ReplicatedStorage"):FindFirstChild("SweetpropsAccessories") or Instance.new("Folder")
    folder.Name = "SweetpropsAccessories"
    folder.Parent = game:GetService("ReplicatedStorage")
    acc.Parent = folder
  end
  Selection:Set({ acc })
  return { name = acc.Name, path = fullPath(acc), worn = humanoid ~= nil, parts = #list }`,

  /** Turns a prop into a Tool players can hold (grip at the bottom), placed in StarterPack. */
  toTool: String.raw`
  begin("make tool")
  local inst = resolve(ARGS.target)
  local copy = flatten(inst:Clone())
  copy:SetAttribute(ID_ATTR, nil)
  if ARGS.length and copy:IsA("Model") then
    local _, s0 = bounds(copy)
    copy:ScaleTo(copy:GetScale() * (ARGS.length / math.max(s0.X, s0.Y, s0.Z, 0.01)))
  end
  for _, d in ipairs(copy:GetDescendants()) do
    if d:IsA("LuaSourceContainer") then d:Destroy() end
  end
  local cf, size = bounds(copy)
  local tool = Instance.new("Tool")
  tool.Name = inst.Name
  tool.RequiresHandle = true
  tool.CanBeDropped = ARGS.droppable == true
  tool.ToolTip = ARGS.tip or inst.Name
  local handle = Instance.new("Part")
  handle.Name = "Handle"
  handle.Size = Vector3.new(0.4, 0.4, 0.4)
  handle.Transparency = 1
  handle.CanCollide = false
  handle.Massless = true
  -- Hold it near the bottom (the grip end), upright in the hand.
  handle.CFrame = (cf - cf.Position) + (cf.Position - cf.UpVector * (size.Y * 0.4))
  handle.Parent = tool
  local list = {}
  if copy:IsA("BasePart") then table.insert(list, copy) end
  for _, d in ipairs(copy:GetDescendants()) do if d:IsA("BasePart") then table.insert(list, d) end end
  for _, p in ipairs(list) do
    p.Anchored = false; p.CanCollide = false; p.Massless = true
    local w = Instance.new("WeldConstraint"); w.Part0 = handle; w.Part1 = p; w.Parent = handle
  end
  for _, c in ipairs(copy:IsA("BasePart") and { copy } or copy:GetChildren()) do c.Parent = tool end
  if not copy:IsA("BasePart") then copy:Destroy() end
  -- Upright in the hand: the tool's up axis points forward from the grip.
  tool.Grip = CFrame.new(0, 0, 0) * CFrame.Angles(math.rad(-90), 0, 0)
  local pack = game:GetService("StarterPack")
  local old = pack:FindFirstChild(tool.Name)
  if old and old:IsA("Tool") then old:Destroy() end
  tool.Parent = pack
  Selection:Set({ tool })
  return { name = tool.Name, path = fullPath(tool), parts = #list }`,

  /** The signed-in Studio user (owner for Open Cloud uploads). */
  whoami: String.raw`
  local ok, uid = pcall(function() return game:GetService("StudioService"):GetUserId() end)
  return { userId = ok and uid or nil, creatorId = game.CreatorId, creatorType = game.CreatorType.Name }`,

  /** Rigs/characters in Workspace that can wear accessories. */
  rigs: String.raw`
  local out = {}
  for _, c in ipairs(workspace:GetChildren()) do
    if c:IsA("Model") and c:FindFirstChildOfClass("Humanoid") then
      table.insert(out, { name = c.Name, path = fullPath(c), r15 = c:FindFirstChild("UpperTorso") ~= nil })
    end
  end
  return out`,

  /** Copies into a line/circle/grid. */
  duplicate: String.raw`
  begin("duplicate")
  local inst = resolve(ARGS.target)
  local n = math.clamp(ARGS.count or 1, 1, 200)
  local pattern = ARGS.pattern or "line"
  local _, size = bounds(inst)
  local gap = ARGS.spacing or (math.max(size.X, size.Z) * 1.25)
  local base = pivotOf(inst)
  local made = {}
  local cols = math.ceil(math.sqrt(n + 1))
  for i = 1, n do
    local c = inst:Clone()
    c:SetAttribute(ID_ATTR, newId())
    local offset
    if pattern == "circle" then
      local r = math.max(gap * (n + 1) / (2 * math.pi), gap)
      local a = (i / (n + 1)) * math.pi * 2
      offset = CFrame.new(math.cos(a) * r - r, 0, math.sin(a) * r) * CFrame.Angles(0, -a, 0)
    elseif pattern == "grid" then
      offset = CFrame.new((i % cols) * gap, 0, math.floor(i / cols) * gap)
    else
      offset = CFrame.new(i * gap, 0, 0)
    end
    c.Parent = inst.Parent
    moveTo(c, base * offset)
    table.insert(made, c)
  end
  Selection:Set(made)
  return #made`,

  scatter: String.raw`
  begin("scatter")
  local inst = resolve(ARGS.target)
  local n = math.clamp(ARGS.count or 8, 1, 300)
  local r = ARGS.radius or 40
  local base = pivotOf(inst)
  local folder = Instance.new("Folder")
  folder.Name = inst.Name .. "_Scatter"
  folder.Parent = inst.Parent
  local rng = Random.new()
  for i = 1, n do
    local c = inst:Clone()
    c:SetAttribute(ID_ATTR, newId())
    c.Parent = folder
    local a, d = rng:NextNumber(0, math.pi * 2), math.sqrt(rng:NextNumber()) * r
    local pos = base.Position + Vector3.new(math.cos(a) * d, 0, math.sin(a) * d)
    local y = groundY(pos, folder) or base.Position.Y
    local rot = ARGS.randomRotation ~= false and CFrame.Angles(0, rng:NextNumber(0, math.pi * 2), 0) or CFrame.new()
    moveTo(c, CFrame.new(pos.X, y, pos.Z) * rot)
    if ARGS.randomScale and c:IsA("Model") then c:ScaleTo(c:GetScale() * rng:NextNumber(0.75, 1.3)) end
  end
  adopt(folder)
  Selection:Set({ folder })
  return n`,

  stripScripts: String.raw`
  begin("strip scripts")
  local inst = resolve(ARGS.target)
  local n = 0
  for _, d in ipairs(inst:GetDescendants()) do
    if d:IsA("LuaSourceContainer") then d:Destroy(); n += 1 end
  end
  return n`,

  /** Cheap wins for performance: shadows off on tiny parts, box collisions, automatic render fidelity. */
  optimize: String.raw`
  begin("optimize")
  local inst = resolve(ARGS.target)
  local n = 0
  for _, p in ipairs(parts(inst)) do
    if p.Size.Magnitude < 1.5 then p.CastShadow = false end
    if p:IsA("MeshPart") then
      pcall(function() p.RenderFidelity = Enum.RenderFidelity.Automatic end)
      if p.Size.Magnitude < 4 then pcall(function() p.CollisionFidelity = Enum.CollisionFidelity.Box end) end
    end
    if p.Transparency >= 1 then p.CanCollide = false; p.CanTouch = false end
    n += 1
  end
  return { parts = n }`,

  group: String.raw`
  begin("group")
  local sel = Selection:Get()
  if #sel == 0 then error("เลือกของใน Studio ก่อน") end
  local m = Instance.new("Model")
  m.Name = ARGS.name or "Prop"
  m.Parent = sel[1].Parent
  for _, s in ipairs(sel) do s.Parent = m end
  adopt(m)
  Selection:Set({ m })
  return describe(m)`,

  /** Box around the prop, used to aim the screenshot camera. */
  bounds: String.raw`
  local inst = resolve(ARGS.target)
  local cf, size = bounds(inst)
  return { center = arr(cf.Position), size = arr(size) }`,

  /** Serializes a prop to plain data so it can be rebuilt in any place (library). */
  serialize: String.raw`
  local inst = resolve(ARGS.target)
  local origin = pivotOf(inst)
  local function cfArr(cf) return { origin:ToObjectSpace(cf):GetComponents() } end
  local function base(p)
    return {
      Size = arr(p.Size), CFrame = cfArr(p.CFrame), Color = p.Color:ToHex(), Material = p.Material.Name,
      MaterialVariant = p.MaterialVariant, Transparency = p.Transparency, Reflectance = p.Reflectance,
      Anchored = p.Anchored, CanCollide = p.CanCollide, CastShadow = p.CastShadow,
    }
  end
  local function node(i)
    local n = { class = i.ClassName, name = i.Name, props = {}, children = {} }
    local attrs = {}
    for k, v in pairs(i:GetAttributes()) do
      -- RBX_* attributes are reserved for Roblox and cannot be written back.
      if (type(v) == "string" or type(v) == "number" or type(v) == "boolean") and k:sub(1, 4) ~= "RBX_" then attrs[k] = v end
    end
    n.attrs = attrs
    if i:IsA("BasePart") then
      n.props = base(i)
      if i:IsA("Part") then n.props.Shape = i.Shape.Name end
      if i:IsA("MeshPart") then
        n.props.MeshId = i.MeshId; n.props.TextureID = i.TextureID
        pcall(function() n.props.DoubleSided = i.DoubleSided end)
      end
    elseif i:IsA("SpecialMesh") then
      n.props = { MeshType = i.MeshType.Name, MeshId = i.MeshId, TextureId = i.TextureId, Scale = arr(i.Scale), Offset = arr(i.Offset), VertexColor = arr(i.VertexColor) }
    elseif i:IsA("SurfaceAppearance") then
      pcall(function() n.props = { ColorMap = i.ColorMap, NormalMap = i.NormalMap, RoughnessMap = i.RoughnessMap, MetalnessMap = i.MetalnessMap, AlphaMode = i.AlphaMode.Name } end)
      pcall(function() n.props.Color = i.Color:ToHex() end)
    elseif i:IsA("Decal") then
      n.props = { Texture = i.Texture, Face = i.Face.Name, Color3 = i.Color3:ToHex(), Transparency = i.Transparency }
      if i:IsA("Texture") then n.props.StudsPerTileU = i.StudsPerTileU; n.props.StudsPerTileV = i.StudsPerTileV end
    elseif i:IsA("Light") then
      n.props = { Color = i.Color:ToHex(), Brightness = i.Brightness, Shadows = i.Shadows }
      if not i:IsA("DirectionalLight") then pcall(function() n.props.Range = i.Range end) end
    elseif i:IsA("Attachment") then
      n.props = { CFrame = { i.CFrame:GetComponents() } }
    elseif i:IsA("LuaSourceContainer") or i:IsA("JointInstance") or i:IsA("WeldConstraint") or i:IsA("ParticleEmitter")
      or i:IsA("Fire") or i:IsA("Smoke") or i:IsA("Highlight") then
      return nil -- rebuilt from SweetpropsEffects instead
    elseif not (i:IsA("Model") or i:IsA("Folder")) then
      return nil
    end
    for _, c in ipairs(i:GetChildren()) do
      if not (c.Name:sub(1, 11) == "Sweetprops_") then
        local cn = node(c)
        if cn then table.insert(n.children, cn) end
      end
    end
    return n
  end
  local _, size = bounds(inst)
  return { root = node(inst), size = arr(size), effects = inst:GetAttribute("SweetpropsEffects") }`,

  /** Rebuilds a serialized prop and drops it in front of the camera. */
  build: String.raw`
  begin("insert from library")
  local data = ARGS.data
  local cam = workspace.CurrentCamera
  local look = cam.CFrame.LookVector
  local flat = Vector3.new(look.X, 0, look.Z)
  flat = flat.Magnitude > 0.01 and flat.Unit or Vector3.new(0, 0, -1)
  local size = v3(data.size)
  local pos = cam.CFrame.Position + flat * math.max(size.Magnitude * 1.2, 10)
  local y = groundY(pos, nil) or (pos.Y - 5)
  local origin = CFrame.lookAt(Vector3.new(pos.X, y, pos.Z), Vector3.new(cam.CFrame.Position.X, y, cam.CFrame.Position.Z))
  local failed = 0
  local function cfFrom(t) return CFrame.new(table.unpack(t)) end
  local function make(n, parent)
    local i
    if n.class == "MeshPart" then
      local ok, mp = pcall(function()
        return AssetService:CreateMeshPartAsync(n.props.MeshId, { CollisionFidelity = Enum.CollisionFidelity.Hull, RenderFidelity = Enum.RenderFidelity.Automatic })
      end)
      if ok and mp then i = mp else i = Instance.new("Part"); failed += 1 end
      if ok and mp then i.TextureID = n.props.TextureID or ""; pcall(function() i.DoubleSided = n.props.DoubleSided end) end
    else
      local ok, created = pcall(Instance.new, n.class)
      if not ok then return end
      i = created
    end
    i.Name = n.name
    local p = n.props or {}
    if i:IsA("BasePart") then
      i.Size = v3(p.Size); i.CFrame = origin * cfFrom(p.CFrame); i.Color = Color3.fromHex(p.Color)
      pcall(function() i.Material = Enum.Material[p.Material] end)
      i.MaterialVariant = p.MaterialVariant or ""; i.Transparency = p.Transparency; i.Reflectance = p.Reflectance
      i.Anchored = p.Anchored; i.CanCollide = p.CanCollide; i.CastShadow = p.CastShadow
      if p.Shape and i:IsA("Part") then pcall(function() i.Shape = Enum.PartType[p.Shape] end) end
    elseif i:IsA("SpecialMesh") then
      i.MeshType = Enum.MeshType[p.MeshType]; i.MeshId = p.MeshId; i.TextureId = p.TextureId
      i.Scale = v3(p.Scale); i.Offset = v3(p.Offset); i.VertexColor = v3(p.VertexColor)
    elseif i:IsA("SurfaceAppearance") then
      for k, v in pairs(p) do pcall(function()
        if k == "AlphaMode" then i[k] = Enum.AlphaMode[v] elseif k == "Color" then i[k] = Color3.fromHex(v) else i[k] = v end
      end) end
    elseif i:IsA("Decal") then
      i.Texture = p.Texture; i.Face = Enum.NormalId[p.Face]; i.Color3 = Color3.fromHex(p.Color3); i.Transparency = p.Transparency
      if i:IsA("Texture") then i.StudsPerTileU = p.StudsPerTileU; i.StudsPerTileV = p.StudsPerTileV end
    elseif i:IsA("Light") then
      i.Color = Color3.fromHex(p.Color); i.Brightness = p.Brightness; i.Shadows = p.Shadows
      if p.Range then pcall(function() i.Range = p.Range end) end
    elseif i:IsA("Attachment") then
      i.CFrame = cfFrom(p.CFrame)
    end
    for k, v in pairs(n.attrs or {}) do
      if k ~= ID_ATTR then pcall(function() i:SetAttribute(k, v) end) end
    end
    for _, c in ipairs(n.children or {}) do make(c, i) end
    i.Parent = parent
    return i
  end
  local inst = make(data.root, workspace)
  if inst:IsA("Model") then
    local biggest, vol = nil, -1
    for _, p in ipairs(parts(inst)) do
      local v = p.Size.X * p.Size.Y * p.Size.Z
      if v > vol then biggest, vol = p, v end
    end
    inst.PrimaryPart = biggest
    setPivot(inst, origin)
  end
  inst:SetAttribute(ID_ATTR, nil)
  local id = adopt(inst)
  Selection:Set({ inst })
  local d = describe(inst)
  d.failedMeshes = failed
  d.effectsToApply = data.effects
  return d`,

  /** Places a prop that was inserted by insert_asset (finds it by name among new children). */
  studioInfo: String.raw`
  local cam = workspace.CurrentCamera
  return { place = game.Name, placeId = game.PlaceId, camera = arr(cam.CFrame.Position), selection = #Selection:Get() }`,
};

export function op(name, args) {
  const body = OPS[name];
  if (!body) throw new Error(`unknown op ${name}`);
  return chunk(body, args);
}

/** Pulls our { ok, data | error } JSON out of whatever execute_luau returned. */
export function extractResult(text) {
  if (!text) throw new Error('Studio ไม่ตอบกลับ');
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(text);
  // Some StudioMCP versions wrap the return value; dig for our envelope.
  if (v && typeof v === 'object' && !('ok' in v)) {
    for (const key of ['result', 'output', 'value', 'returnValue']) {
      if (typeof v[key] === 'string') { const inner = tryParse(v[key]); if (inner && 'ok' in inner) { v = inner; break; } }
      if (v[key] && typeof v[key] === 'object' && 'ok' in v[key]) { v = v[key]; break; }
    }
  }
  if (!(v && typeof v === 'object' && 'ok' in v)) {
    const start = text.indexOf('{"');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) v = tryParse(text.slice(start, end + 1));
  }
  if (!(v && typeof v === 'object' && 'ok' in v)) throw new Error(`อ่านผลจาก Studio ไม่ได้: ${text.slice(0, 300)}`);
  if (!v.ok) throw new Error(v.error || 'Luau error');
  return v.data;
}
