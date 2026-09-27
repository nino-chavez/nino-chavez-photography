package.path = 'tools/lightroom/photo-editing-roundtrip.lrplugin/?.lua;' .. package.path
local Core = require 'Core'
local CloudCore = require 'CloudCore'

local function clone(value) return Core.deepCopy(value) end
local function assertTrue(value, message) if not value then error(message or 'assertion failed', 2) end end
local function assertEqual(left, right, message) if left ~= right then error(message or (tostring(left) .. ' ~= ' .. tostring(right)), 2) end end

local CATALOG = '/Users/nino/Pictures/Lightroom/Cloud Return Test.lrcat'
local ROOT = '/private/tmp/cloud-return-evidence'

local function recipe(exposure)
    return {
        Exposure2012 = exposure or 0.5,
        ProcessVersion = '11.0',
        AILook = { id = 'adaptive', nested = { amount = 0.8 } },
        MaskGroupBasedCorrections = { { mask = { id = 'subject', regions = { 1, 2 } }, exposure = -0.2 } },
        ToneCurvePV2012 = { { 0, 0 }, { 255, 255 } },
    }
end

local function photo(uuid, settings, options)
    options = options or {}
    return {
        info = {
            uuid = uuid,
            path = options.path or ('/Users/nino/Pictures/cloud-return/' .. uuid .. '.ARW'),
            isVirtualCopy = options.isVirtualCopy or false,
            masterUuid = options.masterUuid,
            isVideo = options.isVideo or false,
            available = options.available ~= false,
        },
        settings = clone(settings or recipe()),
    }
end

local function permit(ids, overrides)
    overrides = overrides or {}
    return {
        catalogPath = overrides.catalogPath or CATALOG,
        evidenceRoot = overrides.evidenceRoot or ROOT,
        photoUuids = ids or { 'a' },
    }
end

local function makeSdk(state, options)
    options = options or {}
    state = state or { job = nil, photos = { photo('a'), photo('b') }, writes = {}, files = {}, saves = 0 }
    local selected = options.selected or { state.photos[1] }
    local function find(uuid)
        for _, item in ipairs(state.photos) do if item.info.uuid == uuid then return item end end
    end
    local sdk = {
        protect = pcall,
        catalogPath = function() return options.catalogPath or CATALOG end,
        targetPhotos = function() return selected end,
        photoInfo = function(item) return clone(item.info) end,
        readSettings = function(item) return clone(item.settings) end,
        findPhotoByUuid = find,
        withWriteAccess = function(label, callback)
            if options.failWriteAccess and options.failWriteAccess(label) then error('simulated write-access failure') end
            if options.mutateInsideGate then options.mutateInsideGate() end
            callback()
            return 'executed'
        end,
        applySettings = function(item, patch, label)
            state.writes[#state.writes + 1] = { uuid = item.info.uuid, patch = clone(patch), label = label }
            for key, value in pairs(patch) do item.settings[key] = clone(value) end
            if options.failAfterApply and options.failAfterApply(item, patch) then error('simulated write failure') end
        end,
        loadCloudJob = function() return state.job end,
        saveCloudJob = function(job) state.job = clone(job); state.saves = state.saves + 1 end,
        now = function() state.tick = (state.tick or 0) + 1; return '2026-09-26T00:00:' .. state.tick .. 'Z' end,
        runId = function() state.run = (state.run or 0) + 1; return 'cloud-' .. state.run end,
        mkdir = function(path) state.mkdir = path end,
        writeFile = function(path, contents) state.files[path] = contents end,
    }
    if options.render then sdk.render = options.render end
    return sdk, state
end

local function test(name, callback)
    local ok, message = pcall(callback)
    if not ok then io.stderr:write('FAIL ' .. name .. ': ' .. tostring(message) .. '\n'); os.exit(1) end
    print('PASS ' .. name)
end

test('missing permits, wrong catalog, and missing permitted targets do not write', function()
    local state = { job = nil, photos = { photo('a'), photo('b') }, writes = {}, files = {}, saves = 0 }
    local sdk = makeSdk(state, { selected = { state.photos[2] } })
    assertEqual(CloudCore.capture(sdk, nil).status, 'refused')
    for _, candidate in ipairs({ {}, permit({ 'a' }, { catalogPath = '/wrong/catalog.lrcat' }), permit({ 'missing' }) }) do
        local result = CloudCore.capture(sdk, candidate)
        assertEqual(result.status, 'refused')
    end
    local wrongCatalogSdk = makeSdk(state, { catalogPath = '/wrong/active-catalog.lrcat', selected = { state.photos[1] } })
    assertEqual(CloudCore.capture(wrongCatalogSdk, permit()).status, 'refused')
    assertEqual(#state.writes, 0, 'unauthorized capture must never write')
    assertEqual(state.job, nil, 'failed capture must not save a job')
end)

test('capture resolves the exact permit set and preserves opaque nested recipes', function()
    local state = { job = nil, photos = { photo('a'), photo('b') }, writes = {}, files = {}, saves = 0 }
    local sdk = makeSdk(state, { selected = { state.photos[1], state.photos[2] } })
    local captured = CloudCore.capture(sdk, permit({ 'a', 'b' }))
    assertEqual(captured.status, 'captured')
    assertTrue(Core.sameRecipe(state.job.targets[1].baseline, recipe()), 'baseline must retain nested SDK recipe data')
    assertTrue(state.job.targets[1].baseline.AILook.nested.amount == 0.8)
    assertTrue(state.job.targets[1].baseline.MaskGroupBasedCorrections[1].mask.regions[2] == 2)
    assertTrue(state.files[captured.jobPath .. '/baseline-receipt.json']:find('adaptive') ~= nil)
    assertEqual(#state.writes, 0, 'capture must not mutate Develop settings')
end)

test('UI selection cannot authorize edits and a wrong SDK identity is refused', function()
    local state = { job = nil, photos = { photo('a'), photo('b') }, writes = {}, files = {}, saves = 0 }
    local sdk = makeSdk(state)
    assertEqual(CloudCore.capture(sdk, nil).status, 'refused')
    local find = sdk.findPhotoByUuid
    sdk.findPhotoByUuid = function() return state.photos[1] end
    assertEqual(CloudCore.capture(sdk, permit({ 'b' })).status, 'refused')
    assertEqual(state.job, nil, 'a wrong SDK identity must not create a job')
    sdk.findPhotoByUuid = find
    assertEqual(CloudCore.capture(sdk, permit({ 'b' })).status, 'captured')
    assertEqual(#state.job.targets, 1)
    assertEqual(state.job.targets[1].identity.uuid, 'b', 'the selected source is not the permitted target')
    assertEqual(#state.writes, 0)
end)

test('a permitted virtual copy changes and restores without writing its protected master', function()
    local master = photo('master')
    local copy = photo('copy', recipe(0.06), { isVirtualCopy = true, masterUuid = 'master', path = master.info.path })
    local state = { job = nil, photos = { master, copy }, writes = {}, files = {}, saves = 0 }
    local p = permit({ 'copy' })
    assertEqual(CloudCore.capture(makeSdk(state), p).status, 'captured')
    assertTrue(Core.sameRecipe(state.job.targets[1].sourceMaster.baseline, master.settings))
    assertEqual(CloudCore.apply(makeSdk(state), p).status, 'applied')
    assertEqual(copy.settings.Exposure2012, 0.31)
    assertTrue(Core.sameRecipe(master.settings, recipe()))
    assertEqual(CloudCore.restore(makeSdk(state), p).status, 'restored')
    assertTrue(Core.sameRecipe(copy.settings, recipe(0.06)))
    for _, write in ipairs(state.writes) do assertEqual(write.uuid, 'copy') end
end)

test('virtual copies require a stable master outside the permitted edit targets', function()
    local master = photo('master')
    local copy = photo('copy', nil, { isVirtualCopy = true, masterUuid = 'master' })
    local state = { job = nil, photos = { master, copy }, writes = {}, files = {}, saves = 0 }
    assertEqual(CloudCore.capture(makeSdk(state), permit({ 'master', 'copy' })).status, 'refused')
    copy.info.masterUuid = nil
    assertEqual(CloudCore.capture(makeSdk(state), permit({ 'copy' })).status, 'refused')
    copy.info.masterUuid = 'missing'
    assertEqual(CloudCore.capture(makeSdk(state), permit({ 'copy' })).status, 'refused')
    assertEqual(#state.writes, 0)
    assertEqual(state.job, nil)
end)

test('a changed virtual-copy master or copy identity stops writes', function()
    local master = photo('master')
    local copy = photo('copy', nil, { isVirtualCopy = true, masterUuid = 'master' })
    local state = { job = nil, photos = { master, copy }, writes = {}, files = {}, saves = 0 }
    local p = permit({ 'copy' })
    assertEqual(CloudCore.capture(makeSdk(state), p).status, 'captured')
    master.settings.Clarity2012 = 9
    assertEqual(CloudCore.apply(makeSdk(state), p).status, 'refused')
    master.settings = recipe()
    local sdk = makeSdk(state, { mutateInsideGate = function() master.settings.Clarity2012 = 8 end })
    assertEqual(CloudCore.apply(sdk, p).status, 'partial')
    master.settings = recipe()
    copy.info.isVirtualCopy = false
    copy.info.masterUuid = nil
    assertEqual(CloudCore.apply(makeSdk(state), p).status, 'partial')
    assertEqual(#state.writes, 0)
end)

test('separate capture apply restore round trip changes only exposure and leaves cloud unverified', function()
    local state = { job = nil, photos = { photo('a') }, writes = {}, files = {}, saves = 0 }
    local captureSdk = makeSdk(state)
    local captured = CloudCore.capture(captureSdk, permit())
    assertEqual(captured.status, 'captured')
    local applySdk = makeSdk(state)
    local applied = CloudCore.apply(applySdk, permit())
    assertEqual(applied.status, 'applied')
    assertTrue(Core.onlyExposureChanged(recipe(), state.photos[1].settings, 0.75))
    assertEqual(state.writes[1].patch.Exposure2012, 0.75)
    assertEqual(next(state.writes[1].patch, 'Exposure2012'), nil, 'apply may patch only exposure')
    assertEqual(state.job.cloudObservation.status, 'unverified')
    local restoreSdk = makeSdk(state)
    local restored = CloudCore.restore(restoreSdk, permit())
    assertEqual(restored.status, 'restored')
    assertTrue(Core.sameRecipe(state.photos[1].settings, recipe()))
    assertTrue(Core.sameRecipe(state.job.targets[1].baseline, recipe()))
end)

test('repeated apply does not accumulate exposure or write again', function()
    local state = { job = nil, photos = { photo('a') }, writes = {}, files = {}, saves = 0 }
    CloudCore.capture(makeSdk(state), permit())
    assertEqual(CloudCore.apply(makeSdk(state), permit()).status, 'applied')
    local writes = #state.writes
    assertEqual(CloudCore.apply(makeSdk(state), permit()).status, 'applied')
    assertEqual(#state.writes, writes, 'retry must adopt intended recipe without another patch')
    assertEqual(state.photos[1].settings.Exposure2012, 0.75)
end)

test('stale recipe refuses before and inside apply write gate', function()
    local state = { job = nil, photos = { photo('a') }, writes = {}, files = {}, saves = 0 }
    CloudCore.capture(makeSdk(state), permit())
    state.photos[1].settings.Contrast2012 = 25
    assertEqual(CloudCore.apply(makeSdk(state), permit()).status, 'refused')
    assertEqual(#state.writes, 0)
    state.photos[1].settings = recipe()
    local sdk = makeSdk(state, { mutateInsideGate = function() state.photos[1].settings.Contrast2012 = 35 end })
    assertEqual(CloudCore.apply(sdk, permit()).status, 'partial')
    assertEqual(#state.writes, 0, 'in-gate stale check must block a write')
end)

test('partial write error persists recovery state and later restore recovers all targets', function()
    local state = { job = nil, photos = { photo('a'), photo('b') }, writes = {}, files = {}, saves = 0 }
    CloudCore.capture(makeSdk(state, { selected = state.photos }), permit({ 'a', 'b' }))
    local failSecond = makeSdk(state, {
        failWriteAccess = function(label) return label:find(' b', 1, true) ~= nil end,
    })
    assertEqual(CloudCore.apply(failSecond, permit({ 'a', 'b' })).status, 'partial')
    assertEqual(state.job.status, 'apply-partial')
    assertEqual(state.photos[1].settings.Exposure2012, 0.75)
    assertEqual(state.photos[2].settings.Exposure2012, 0.5, 'failed target must remain at baseline')
    assertEqual(CloudCore.restore(makeSdk(state), permit({ 'a', 'b' })).status, 'restored')
    assertTrue(Core.sameRecipe(state.photos[1].settings, recipe()))
    assertTrue(Core.sameRecipe(state.photos[2].settings, recipe()))
end)

test('restore refuses unknown intervening changes without writing', function()
    local state = { job = nil, photos = { photo('a') }, writes = {}, files = {}, saves = 0 }
    CloudCore.capture(makeSdk(state), permit())
    CloudCore.apply(makeSdk(state), permit())
    state.photos[1].settings.Clarity2012 = 10
    local writes = #state.writes
    assertEqual(CloudCore.restore(makeSdk(state), permit()).status, 'refused')
    assertEqual(#state.writes, writes, 'restore may not overwrite an unknown recipe')
end)

test('a later stale target reports prior writes as partial and preserves recovery state', function()
    local state = { job = nil, photos = { photo('a'), photo('b') }, writes = {}, files = {}, saves = 0 }
    CloudCore.capture(makeSdk(state, { selected = state.photos }), permit({ 'a', 'b' }))
    local sdk = makeSdk(state, {
        failAfterApply = function(item)
            if item.info.uuid == 'a' then state.photos[2].settings.Clarity2012 = 99 end
            return false
        end,
    })
    local result = CloudCore.apply(sdk, permit({ 'a', 'b' }))
    assertEqual(result.status, 'partial')
    assertEqual(state.job.status, 'apply-partial')
    assertEqual(state.job.targets[1].localResult.apply.state, 'applied')
    assertEqual(#state.writes, 1)
    assertEqual(state.photos[2].settings.Clarity2012, 99)
end)

test('persisted job survives separate adapters and unresolved job blocks a new capture', function()
    local state = { job = nil, photos = { photo('a') }, writes = {}, files = {}, saves = 0 }
    local captured = CloudCore.capture(makeSdk(state), permit())
    assertEqual(captured.status, 'captured')
    assertEqual(CloudCore.capture(makeSdk(state), permit()).status, 'refused')
    assertEqual(CloudCore.apply(makeSdk(state), permit()).status, 'applied')
    assertEqual(CloudCore.restore(makeSdk(state), permit()).status, 'restored')
    assertEqual(CloudCore.capture(makeSdk(state), permit()).status, 'captured', 'resolved job may be replaced by a new capture')
end)

test('a restored-render failure is recorded after restoration, not treated as a failed restore', function()
    local state = { job = nil, photos = { photo('a') }, writes = {}, files = {}, saves = 0 }
    CloudCore.capture(makeSdk(state), permit())
    CloudCore.apply(makeSdk(state), permit())
    local restoreSdk = makeSdk(state, { render = function() error('simulated render failure') end })
    assertEqual(CloudCore.restore(restoreSdk, permit()).status, 'restored')
    assertTrue(Core.sameRecipe(state.photos[1].settings, recipe()))
    assertEqual(state.job.localResult.restoredRender.status, 'error')
end)
