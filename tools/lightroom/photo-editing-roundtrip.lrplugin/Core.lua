-- Pure Lua policy and orchestration. Runtime.lua supplies Lightroom SDK calls.
-- No recipe is ever evaluated as Lua; snapshots are serialized data only.

local Core = {}

Core.PLUGIN_VERSION = '0.1.0'
Core.ALLOWED_FILENAMES = {
    DSC06706 = true,
    DSC09233 = true,
    DSC09234 = true,
    DSC09430 = true,
    DSC09442 = true,
}

local function fail(message)
    error(message, 0)
end

local function sortedKeys(value)
    local keys = {}
    for key in pairs(value) do
        keys[#keys + 1] = key
    end
    table.sort(keys, function(a, b)
        local ta, tb = type(a), type(b)
        if ta ~= tb then return ta < tb end
        return tostring(a) < tostring(b)
    end)
    return keys
end

function Core.deepCopy(value, seen)
    if type(value) ~= 'table' then return value end
    seen = seen or {}
    if seen[value] then fail('Recipe contains a circular table; refusing to truncate it.') end
    local copy = {}
    seen[value] = copy
    for key, child in pairs(value) do
        copy[Core.deepCopy(key, seen)] = Core.deepCopy(child, seen)
    end
    seen[value] = nil
    return copy
end

local function jsonString(value)
    return '"' .. value:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\b', '\\b')
        :gsub('\f', '\\f'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t')
        :gsub('[%z\1-\31]', function(character)
            return string.format('\\u%04x', string.byte(character))
        end) .. '"'
end

function Core.toJson(value, seen)
    local valueType = type(value)
    if value == nil then return 'null' end
    if valueType == 'boolean' then return value and 'true' or 'false' end
    if valueType == 'number' then
        if value ~= value or value == math.huge or value == -math.huge then
            fail('Recipe contains a non-finite number; refusing to serialize it.')
        end
        return string.format('%.17g', value)
    end
    if valueType == 'string' then return jsonString(value) end
    if valueType ~= 'table' then
        fail('Recipe contains unsupported ' .. valueType .. ' data; refusing to serialize it.')
    end

    seen = seen or {}
    if seen[value] then fail('Recipe contains a circular table; refusing to serialize it.') end
    seen[value] = true
    local pieces = {}
    for _, key in ipairs(sortedKeys(value)) do
        if type(key) ~= 'string' and type(key) ~= 'number' then
            fail('Recipe has a non-string/non-number key; refusing to serialize it.')
        end
        pieces[#pieces + 1] = jsonString(tostring(key)) .. ':' .. Core.toJson(value[key], seen)
    end
    seen[value] = nil
    return '{' .. table.concat(pieces, ',') .. '}'
end

function Core.sameRecipe(left, right)
    return Core.toJson(left) == Core.toJson(right)
end

function Core.onlyExposureChanged(before, after, expectedExposure)
    if after.Exposure2012 ~= expectedExposure then return false end
    local beforeRest = Core.deepCopy(before)
    local afterRest = Core.deepCopy(after)
    beforeRest.Exposure2012 = nil
    afterRest.Exposure2012 = nil
    return Core.sameRecipe(beforeRest, afterRest)
end

local function join(root, child)
    if root:sub(-1) == '/' then return root .. child end
    return root .. '/' .. child
end

local function basename(path)
    return path:match('([^/]+)$') or path
end

local function stem(path)
    return basename(path):match('^(.*)%.%w+$') or basename(path)
end

local function pathInside(path, root)
    return path == root or path:sub(1, #root + 1) == root .. '/'
end

local function expectedPaths(homePath)
    local pilotRoot = join(homePath, 'Pictures/Photo Editing Pilot/2026-09-26')
    return {
        pilotRoot = pilotRoot,
        originalsRoot = join(pilotRoot, 'originals'),
        catalogPath = join(pilotRoot, 'Photo Editing Recovery Test/Photo Editing Recovery Test.lrcat'),
        receiptsRoot = join(pilotRoot, 'plugin-receipts'),
    }
end

local function identitySummary(info)
    return {
        uuid = info.uuid,
        path = info.path,
        masterUuid = info.masterUuid,
        isVirtualCopy = info.isVirtualCopy == true,
        isVideo = info.isVideo == true,
        fileFormat = info.fileFormat,
        available = info.available,
    }
end

local function sameIdentity(left, right)
    return left.uuid == right.uuid and left.path == right.path
        and left.isVirtualCopy == right.isVirtualCopy and left.masterUuid == right.masterUuid
end

local function assertMaster(info, paths)
    if info.available ~= true then fail('Refusing unavailable original ' .. tostring(info.path) .. '.') end
    if info.isVirtualCopy then fail('Refusing virtual copy ' .. tostring(info.uuid) .. '; select image masters only.') end
    if info.isVideo or info.fileFormat == 'VIDEO' then fail('Refusing video ' .. tostring(info.path) .. '.') end
    if not info.uuid or not info.path then fail('Refusing photo without a stable UUID and path.') end
    if not pathInside(info.path, paths.originalsRoot) then
        fail('Refusing photo outside the pilot originals folder: ' .. info.path)
    end
    if not Core.ALLOWED_FILENAMES[stem(info.path)] then
        fail('Refusing an unexpected pilot original: ' .. basename(info.path))
    end
end

local function readTargets(sdk, paths)
    local photos = sdk.targetPhotos()
    if #photos < 1 or #photos > 5 then
        fail('Select 1-5 detached pilot image masters before running this command.')
    end
    local records, seen = {}, {}
    for _, photo in ipairs(photos) do
        local info = sdk.photoInfo(photo)
        assertMaster(info, paths)
        if seen[info.uuid] then fail('Refusing duplicate selected identity ' .. info.uuid .. '.') end
        seen[info.uuid] = true
        records[#records + 1] = {
            photo = photo,
            identity = identitySummary(info),
            recipe = Core.deepCopy(sdk.readSettings(photo)),
        }
    end
    return records
end

local function assertCatalog(sdk, paths)
    if sdk.catalogPath() ~= paths.catalogPath then
        fail('This command only runs in the detached Photo Editing Recovery Test catalog.')
    end
end

local function assertTargetsStillCurrent(sdk, records)
    local current = sdk.targetPhotos()
    if #current ~= #records then fail('Selection changed before virtual copies were created.') end
    local expected = {}
    for _, record in ipairs(records) do expected[record.identity.uuid] = record.identity end
    for _, photo in ipairs(current) do
        local actual = identitySummary(sdk.photoInfo(photo))
        local wanted = expected[actual.uuid]
        if not wanted or not sameIdentity(wanted, actual) then
            fail('Selection changed before virtual copies were created.')
        end
    end
end

local function writeReceipt(sdk, jobPath, name, receipt)
    sdk.writeFile(join(jobPath, name), Core.toJson(receipt))
end

local function makeReceipt(sdk, operation, paths, records, runId)
    local sources = {}
    for _, record in ipairs(records) do
        sources[#sources + 1] = {
            identity = record.identity,
            recipe = record.recipe,
            recipeSnapshot = Core.toJson(record.recipe),
        }
    end
    return {
        schema = 1,
        operation = operation,
        runId = runId,
        startedAt = sdk.now(),
        pluginVersion = Core.PLUGIN_VERSION,
        applicationVersion = sdk.applicationVersion(),
        catalogPath = paths.catalogPath,
        originalsRoot = paths.originalsRoot,
        sources = sources,
        stages = {},
        errors = {},
        hostVerification = {
            installed = 'unverified',
            sdkRuntime = 'unverified',
            rendering = 'unverified',
            undo = 'unverified',
        },
        hdrExport = {
            sourceMode = 'recorded from each full recipe',
            option = 'JPEG, quality 1, sRGB_hdr, enableHDRDisplay=true, maximumCompatibility=true, 2048x2048, no enlargement or output sharpening',
            provenance = 'Values from the Photo Editing Pilot - 2048 HDR preset saved by Classic 15.5.1; SDK LR_ prefixes added.',
            status = 'Requires independent file and visual checks; export success alone does not prove HDR fidelity.',
        },
    }
end

local function assertMasterRecipesUnchanged(sdk, records)
    for _, record in ipairs(records) do
        local current = sdk.readSettings(record.photo)
        if not Core.sameRecipe(record.recipe, current) then
            fail('Source master recipe changed for ' .. record.identity.path .. '; stopping.')
        end
    end
end

local function stage(receipt, name, result)
    receipt.stages[#receipt.stages + 1] = { name = name, result = result }
end

function Core.exportSelectedRecipes(sdk)
    local paths = expectedPaths(sdk.homePath())
    assertCatalog(sdk, paths)
    local records = readTargets(sdk, paths)
    local runId = sdk.runId()
    local jobPath = join(paths.receiptsRoot, runId)
    sdk.mkdir(jobPath)
    local receipt = makeReceipt(sdk, 'export-selected-recipes', paths, records, runId)
    receipt.completedAt = sdk.now()
    receipt.status = 'success'
    writeReceipt(sdk, jobPath, 'receipt.json', receipt)
    return { jobPath = jobPath, receiptPath = join(jobPath, 'receipt.json'), status = 'success' }
end

local function mapCopies(sdk, copies, records)
    if #copies ~= #records then fail('Virtual-copy count did not match the selected masters.') end
    local sourceByUuid, copyByMaster = {}, {}
    for _, record in ipairs(records) do sourceByUuid[record.identity.uuid] = record end
    for _, copy in ipairs(copies) do
        local info = sdk.photoInfo(copy)
        if not info.isVirtualCopy or not info.masterUuid or not sourceByUuid[info.masterUuid] then
            fail('Created virtual copy did not resolve to a selected master.')
        end
        if copyByMaster[info.masterUuid] then fail('Created duplicate virtual copies for one master.') end
        copyByMaster[info.masterUuid] = {
            photo = copy,
            identity = identitySummary(info),
            source = sourceByUuid[info.masterUuid],
            expectedRecipe = Core.deepCopy(sourceByUuid[info.masterUuid].recipe),
        }
    end
    local mapped = {}
    for _, record in ipairs(records) do
        local copy = copyByMaster[record.identity.uuid]
        if not copy then fail('Missing virtual copy for selected master.') end
        mapped[#mapped + 1] = copy
    end
    return mapped
end

local function assertCopyTarget(sdk, copy)
    local now = identitySummary(sdk.photoInfo(copy.photo))
    if not sameIdentity(copy.identity, now) or now.masterUuid ~= copy.source.identity.uuid then
        fail('Virtual-copy target is stale; refusing write.')
    end
end

local function copyReadback(sdk, copies)
    local readback = {}
    for _, copy in ipairs(copies) do
        assertCopyTarget(sdk, copy)
        local recipe = Core.deepCopy(sdk.readSettings(copy.photo))
        readback[#readback + 1] = {
            identity = copy.identity,
            recipe = recipe,
            recipeSnapshot = Core.toJson(recipe),
        }
    end
    return readback
end

local function writeSettings(sdk, copy, settings, historyName, expectedBefore)
    assertCopyTarget(sdk, copy)
    if expectedBefore and not Core.sameRecipe(expectedBefore, sdk.readSettings(copy.photo)) then
        fail('Virtual-copy recipe is stale before ' .. historyName .. '; refusing write.')
    end
    local result = sdk.withWriteAccess(historyName, function()
        assertCatalog(sdk, expectedPaths(sdk.homePath()))
        assertCopyTarget(sdk, copy)
        if expectedBefore and not Core.sameRecipe(expectedBefore, sdk.readSettings(copy.photo)) then
            fail('Virtual-copy recipe changed while waiting for write access; refusing write.')
        end
        local intended = Core.deepCopy(expectedBefore or copy.expectedRecipe)
        for key, value in pairs(settings) do intended[key] = Core.deepCopy(value) end
        copy.attemptedRecipe = intended
        sdk.applySettings(copy.photo, settings, historyName)
    end)
    if result ~= 'executed' then fail('Write access was not executed: ' .. tostring(result)) end
end

local function restoreCopies(sdk, copies, receipt)
    local restored = true
    for _, copy in ipairs(copies) do
        local ok, message = sdk.protect(function()
            local current = sdk.readSettings(copy.photo)
            if not Core.sameRecipe(current, copy.expectedRecipe)
                and not (copy.attemptedRecipe and Core.sameRecipe(current, copy.attemptedRecipe)) then
                fail('Virtual-copy recipe changed outside the probe; refusing cleanup write.')
            end
            writeSettings(sdk, copy, Core.deepCopy(copy.source.recipe), 'Photo Editing Probe: restore ' .. copy.source.identity.uuid, current)
            local readback = sdk.readSettings(copy.photo)
            if not Core.sameRecipe(copy.source.recipe, readback) then
                fail('Restore readback differs from saved full recipe for ' .. copy.source.identity.uuid)
            end
            copy.expectedRecipe = Core.deepCopy(copy.source.recipe)
        end)
        if not ok then
            restored = false
            receipt.errors[#receipt.errors + 1] = { stage = 'cleanup-restore', photo = copy.source.identity.uuid, message = tostring(message) }
        end
    end
    local readback = nil
    if restored then readback = copyReadback(sdk, copies) end
    stage(receipt, 'cleanup-restore', { restored = restored, readback = readback })
    return restored
end

function Core.runProbe(sdk)
    local paths = expectedPaths(sdk.homePath())
    assertCatalog(sdk, paths)
    local records = readTargets(sdk, paths)
    local runId = sdk.runId()
    local jobPath = join(paths.receiptsRoot, runId)
    sdk.mkdir(jobPath)
    local receipt = makeReceipt(sdk, 'bounded-round-trip-probe', paths, records, runId)
    writeReceipt(sdk, jobPath, 'initial-settings.json', { sources = receipt.sources })

    local copies = {}
    local cleanupRestored = false
    local ok, message = sdk.protect(function()
        assertCatalog(sdk, paths)
        assertTargetsStillCurrent(sdk, records)
        copies = mapCopies(sdk, sdk.createVirtualCopies('Photo Editing Probe ' .. runId), records)
        stage(receipt, 'create-virtual-copies', { count = #copies })
        assertMasterRecipesUnchanged(sdk, records)

        local copyPhotos = {}
        for _, copy in ipairs(copies) do copyPhotos[#copyPhotos + 1] = copy.photo end
        stage(receipt, 'baseline-render', { outputs = sdk.render(copyPhotos, join(jobPath, 'baseline'), 'baseline') })
        assertMasterRecipesUnchanged(sdk, records)

        for _, copy in ipairs(copies) do
            writeSettings(sdk, copy, Core.deepCopy(copy.source.recipe), 'Photo Editing Probe: reapply full recipe', copy.expectedRecipe)
            if not Core.sameRecipe(copy.source.recipe, sdk.readSettings(copy.photo)) then
                fail('Reapplied recipe readback differs for ' .. copy.source.identity.uuid)
            end
            copy.expectedRecipe = Core.deepCopy(copy.source.recipe)
        end
        stage(receipt, 'reapply-full-recipe', { verified = true, readback = copyReadback(sdk, copies) })
        stage(receipt, 'reapplied-render', { outputs = sdk.render(copyPhotos, join(jobPath, 'reapplied'), 'reapplied') })
        assertMasterRecipesUnchanged(sdk, records)

        for _, copy in ipairs(copies) do
            local oldExposure = copy.source.recipe.Exposure2012
            if type(oldExposure) ~= 'number' then fail('Exposure2012 is unavailable for ' .. copy.source.identity.uuid) end
            local newExposure = tonumber(string.format('%.2f', oldExposure + 0.25))
            writeSettings(sdk, copy, { Exposure2012 = newExposure }, 'Photo Editing Probe: Exposure2012 +0.25', copy.expectedRecipe)
            if not Core.onlyExposureChanged(copy.source.recipe, sdk.readSettings(copy.photo), newExposure) then
                fail('Exposure probe changed more than Exposure2012 for ' .. copy.source.identity.uuid)
            end
            copy.expectedRecipe = Core.deepCopy(copy.source.recipe)
            copy.expectedRecipe.Exposure2012 = newExposure
        end
        stage(receipt, 'exposure-plus-0.25', { verified = true, readback = copyReadback(sdk, copies) })
        stage(receipt, 'exposure-render', { outputs = sdk.render(copyPhotos, join(jobPath, 'exposure-plus-0.25'), 'exposure-plus-0.25') })
        assertMasterRecipesUnchanged(sdk, records)

        cleanupRestored = restoreCopies(sdk, copies, receipt)
        if not cleanupRestored then fail('One or more virtual copies could not be restored.') end
        stage(receipt, 'restored-render', { outputs = sdk.render(copyPhotos, join(jobPath, 'restored'), 'restored') })
        assertMasterRecipesUnchanged(sdk, records)
    end)

    if not ok then receipt.errors[#receipt.errors + 1] = { stage = 'probe', message = message } end
    if #copies > 0 and not cleanupRestored then
        cleanupRestored = restoreCopies(sdk, copies, receipt)
    end
    local mastersOk, mastersMessage = sdk.protect(assertMasterRecipesUnchanged, sdk, records)
    if not mastersOk then receipt.errors[#receipt.errors + 1] = { stage = 'source-master-final-check', message = tostring(mastersMessage) } end
    receipt.completedAt = sdk.now()
    receipt.status = ok and mastersOk and #receipt.errors == 0 and 'success' or 'failed'
    receipt.virtualCopiesLeftForInspection = #copies
    writeReceipt(sdk, jobPath, 'receipt.json', receipt)
    return { jobPath = jobPath, receiptPath = join(jobPath, 'receipt.json'), status = receipt.status, error = ok and nil or message }
end

return Core
