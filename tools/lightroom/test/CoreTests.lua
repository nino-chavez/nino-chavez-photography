package.path = 'tools/lightroom/photo-editing-roundtrip.lrplugin/?.lua;' .. package.path
local Core = require 'Core'

local function clone(value) return Core.deepCopy(value) end
local function assertTrue(value, message) if not value then error(message or 'assertion failed', 2) end end
local function assertEqual(left, right, message) if left ~= right then error(message or (tostring(left) .. ' ~= ' .. tostring(right)), 2) end end

local function photo(uuid, stem, settings, options)
    options = options or {}
    return {
        info = {
            uuid = uuid,
            path = options.path or ('/Users/nino/Pictures/Photo Editing Pilot/2026-09-26/originals/' .. stem .. '.ARW'),
            masterUuid = options.masterUuid,
            isVirtualCopy = options.isVirtualCopy or false,
            isVideo = options.isVideo or false,
            fileFormat = options.fileFormat or 'RAW',
            available = options.available ~= false,
        },
        settings = clone(settings),
    }
end

local function makeSdk(options)
    options = options or {}
    local baseRecipe = {
        Exposure2012 = 0.5,
        CameraProfile = 'Adaptive Profile',
        AILook = { id = 'adaptive-id', nested = { amount = 0.8 } },
        MaskGroupBasedCorrections = { { mask = { id = 'subject' }, exposure = -0.2 } },
        HDREditMode = 1,
        ToneCurvePV2012 = { { 0, 0 }, { 255, 255 } },
    }
    local master = photo('master-1', 'DSC06706', baseRecipe)
    local targets = options.targets or { master }
    local written = {}
    local exports = {}
    local writes = {}
    local sdk = {
        protect = pcall,
        homePath = function() return '/Users/nino' end,
        catalogPath = function()
            return options.catalogPath or '/Users/nino/Pictures/Photo Editing Pilot/2026-09-26/Photo Editing Recovery Test/Photo Editing Recovery Test.lrcat'
        end,
        targetPhotos = function()
            if options.staleSelection and options.targetCalls and options.targetCalls >= 1 then return {} end
            options.targetCalls = (options.targetCalls or 0) + 1
            return targets
        end,
        photoInfo = function(item) return clone(item.info) end,
        readSettings = function(item) return clone(item.settings) end,
        applySettings = function(item, settings)
            writes[#writes + 1] = clone(settings)
            for key, value in pairs(settings) do item.settings[key] = clone(value) end
            if options.failAfterExposureApply and settings.Exposure2012 == 0.75 then
                error('simulated SDK error after applying exposure')
            end
        end,
        withWriteAccess = function(_, action)
            if options.staleInsideGate then options.copies[1].settings.Contrast2012 = 90 end
            action(); return 'executed'
        end,
        createVirtualCopies = function()
            local copies = {}
            for _, source in ipairs(targets) do
                local copy = photo('copy-' .. source.info.uuid, 'virtual-' .. source.info.uuid, source.settings, {
                    path = source.info.path,
                    masterUuid = source.info.uuid,
                    isVirtualCopy = true,
                })
                copies[#copies + 1] = copy
            end
            options.copies = copies
            return copies
        end,
        mkdir = function() end,
        writeFile = function(filePath, contents) written[filePath] = contents end,
        now = function() return '2026-09-26T00:00:00Z' end,
        runId = function() return 'lr-test' end,
        applicationVersion = function() return '15.5.1-test' end,
        render = function(_, _, stage)
            if options.failRenderAt == stage then error('simulated render failure') end
            if options.mutateCopyBeforeExposure and stage == 'reapplied' then
                options.copies[1].settings.Contrast2012 = 80
            end
            exports[#exports + 1] = stage
            return { '/tmp/' .. stage .. '.jpg' }
        end,
    }
    options.writes = writes
    return sdk, master, written, exports, options
end

local function test(name, callback)
    local ok, message = pcall(callback)
    if not ok then io.stderr:write('FAIL ' .. name .. ': ' .. tostring(message) .. '\n'); os.exit(1) end
    print('PASS ' .. name)
end

test('target restrictions reject a source outside detached originals', function()
    local sdk = makeSdk({ targets = { photo('master-1', 'DSC06706', { Exposure2012 = 0 }, { path = '/Users/nino/Pictures/other/DSC06706.ARW' }) } })
    local ok = pcall(Core.exportSelectedRecipes, sdk)
    assertTrue(not ok, 'outside source must be refused')
end)

test('nested recipes survive serialization and full reapply', function()
    local sdk, master, written = makeSdk()
    local result = Core.exportSelectedRecipes(sdk)
    assertEqual(result.status, 'success')
    assertTrue(written[result.receiptPath]:find('adaptive%-id') ~= nil, 'nested AILook must be persisted')
    assertTrue(written[result.receiptPath]:find('subject') ~= nil, 'nested mask recipe must be persisted')
    assertTrue(Core.sameRecipe(master.settings, { Exposure2012 = 0.5, CameraProfile = 'Adaptive Profile', AILook = { id = 'adaptive-id', nested = { amount = 0.8 } }, MaskGroupBasedCorrections = { { mask = { id = 'subject' }, exposure = -0.2 } }, HDREditMode = 1, ToneCurvePV2012 = { { 0, 0 }, { 255, 255 } } }))
end)

test('probe changes only Exposure2012 and restores complete settings', function()
    local sdk, master, _, _, state = makeSdk()
    local before = clone(master.settings)
    local result = Core.runProbe(sdk)
    assertEqual(result.status, 'success')
    assertTrue(Core.sameRecipe(master.settings, before), 'master must remain unchanged')
    assertEqual(#state.copies, 1)
    assertTrue(Core.sameRecipe(state.copies[1].settings, before), 'virtual copy must end at the complete saved recipe')
    local exposureWrite
    for _, write in ipairs(state.writes) do
        if write.Exposure2012 == before.Exposure2012 + 0.25 then exposureWrite = write end
    end
    assertTrue(exposureWrite ~= nil, 'probe must write the expected exposure delta')
    assertEqual(exposureWrite.Exposure2012, before.Exposure2012 + 0.25)
    assertEqual(next(exposureWrite, 'Exposure2012'), nil, 'exposure stage must send no other recipe key')
end)

test('stale target selection is refused before virtual-copy creation', function()
    local sdk = makeSdk({ staleSelection = true })
    local result = Core.runProbe(sdk)
    assertEqual(result.status, 'failed')
end)

test('stale virtual-copy recipe is refused before exposure write', function()
    local sdk, master, _, _, state = makeSdk({ mutateCopyBeforeExposure = true })
    local result = Core.runProbe(sdk)
    assertEqual(result.status, 'failed')
    assertTrue(Core.sameRecipe(master.settings, { Exposure2012 = 0.5, CameraProfile = 'Adaptive Profile', AILook = { id = 'adaptive-id', nested = { amount = 0.8 } }, MaskGroupBasedCorrections = { { mask = { id = 'subject' }, exposure = -0.2 } }, HDREditMode = 1, ToneCurvePV2012 = { { 0, 0 }, { 255, 255 } } }), 'source master must remain unchanged')
    assertEqual(state.copies[1].settings.Exposure2012, 0.5, 'stale copy must not receive exposure write')
end)

test('a render error still restores virtual copies', function()
    local sdk, master, _, _, state = makeSdk({ failRenderAt = 'exposure-plus-0.25' })
    local before = clone(master.settings)
    local result = Core.runProbe(sdk)
    assertEqual(result.status, 'failed')
    assertEqual(#state.copies, 1)
    assertTrue(Core.sameRecipe(state.copies[1].settings, before), 'cleanup must restore after render failure')
end)

test('wrong catalog, unavailable images, videos, copies, and empty selections fail closed', function()
    local invalid = {
        { catalogPath = '/Users/nino/Pictures/Live.lrcat' },
        { targets = {} },
        { targets = { photo('m', 'DSC06706', {}, { available = false }) } },
        { targets = { photo('m', 'DSC06706', {}, { isVideo = true }) } },
        { targets = { photo('m', 'DSC06706', {}, { isVirtualCopy = true }) } },
    }
    for _, options in ipairs(invalid) do
        local sdk = makeSdk(options)
        local ok = pcall(Core.exportSelectedRecipes, sdk)
        assertTrue(not ok, 'invalid input must fail before a job starts')
    end
end)

test('recipe changed while waiting for write access is not overwritten', function()
    local sdk, _, _, _, state = makeSdk({ staleInsideGate = true })
    local result = Core.runProbe(sdk)
    assertEqual(result.status, 'failed')
    assertEqual(#state.writes, 0, 'no write may pass the in-gate stale check')
    assertEqual(state.copies[1].settings.Contrast2012, 90)
end)

test('SDK error after an exposure write still restores the known attempted recipe', function()
    local sdk, master, _, _, state = makeSdk({ failAfterExposureApply = true })
    local result = Core.runProbe(sdk)
    assertEqual(result.status, 'failed')
    assertTrue(Core.sameRecipe(state.copies[1].settings, master.settings), 'known partial SDK write must be restored')
end)
