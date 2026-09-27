-- Bounded local-recipe orchestration for a separately observed cloud-return test.
-- Runtime.lua owns the Lightroom adapter. Saved recipes are adapter data, never Lua code.

local Core = require 'Core'
local CloudCore = {}

CloudCore.VERSION = 2

local function fail(message)
    error(message, 0)
end

local function join(root, child)
    if root:sub(-1) == '/' then return root .. child end
    return root .. '/' .. child
end

local function isAbsolutePath(path)
    return type(path) == 'string' and path:sub(1, 1) == '/'
end

local function copyArray(values)
    local result = {}
    for index, value in ipairs(values) do result[index] = value end
    return result
end

local function uuidSet(values, label)
    if type(values) ~= 'table' then fail(label .. ' must be an array.') end
    local result, count = {}, 0
    for index, uuid in ipairs(values) do
        if type(uuid) ~= 'string' or uuid == '' then
            fail(label .. ' contains an empty UUID at index ' .. tostring(index) .. '.')
        end
        if result[uuid] then fail(label .. ' contains duplicate UUID ' .. uuid .. '.') end
        result[uuid] = true
        count = count + 1
    end
    if count < 1 or count > 3 then fail(label .. ' must contain 1-3 UUIDs.') end
    return result, count
end

local function validatePermit(permit)
    if type(permit) ~= 'table' then fail('A parent-authored permit is required.') end
    if not isAbsolutePath(permit.catalogPath) then fail('Permit catalogPath must be an absolute path.') end
    if not isAbsolutePath(permit.evidenceRoot) then fail('Permit evidenceRoot must be an absolute path.') end
    local ids = uuidSet(permit.photoUuids, 'Permit photoUuids')
    return {
        catalogPath = permit.catalogPath,
        evidenceRoot = permit.evidenceRoot,
        photoUuids = copyArray(permit.photoUuids),
        uuidSet = ids,
    }
end

local function assertCatalog(sdk, permit)
    if sdk.catalogPath() ~= permit.catalogPath then
        fail('The active catalog does not match the permit.')
    end
end

local function identity(info)
    return { uuid = info.uuid, path = info.path, isVirtualCopy = info.isVirtualCopy == true, masterUuid = info.masterUuid }
end

local function assertImageTarget(info, prefix)
    if type(info) ~= 'table' or type(info.uuid) ~= 'string' or info.uuid == ''
        or not isAbsolutePath(info.path) then
        fail(prefix .. ' does not have a stable UUID and absolute path.')
    end
    if info.available ~= true then fail(prefix .. ' is unavailable: ' .. info.uuid) end
    if info.isVirtualCopy == true and (type(info.masterUuid) ~= 'string' or info.masterUuid == '' or info.masterUuid == info.uuid) then
        fail(prefix .. ' does not have a stable virtual-copy master: ' .. info.uuid)
    end
    if info.isVideo == true then fail(prefix .. ' is a video: ' .. info.uuid) end
end

local function sameIdentity(saved, actual)
    return saved.uuid == actual.uuid and saved.path == actual.path
        and saved.isVirtualCopy == actual.isVirtualCopy and saved.masterUuid == actual.masterUuid
end

local function samePermit(saved, permit)
    if type(saved) ~= 'table' or saved.catalogPath ~= permit.catalogPath
        or saved.evidenceRoot ~= permit.evidenceRoot then
        return false
    end
    local savedSet, savedCount = uuidSet(saved.photoUuids, 'Saved job photoUuids')
    local permitSet, permitCount = uuidSet(permit.photoUuids, 'Permit photoUuids')
    if savedCount ~= permitCount then return false end
    for uuid in pairs(savedSet) do if not permitSet[uuid] then return false end end
    return true
end

local function intendedRecipe(baseline, uuid)
    if type(baseline.Exposure2012) ~= 'number' then
        fail('Exposure2012 is unavailable for ' .. uuid .. '.')
    end
    local intended = Core.deepCopy(baseline)
    intended.Exposure2012 = tonumber(string.format('%.2f', baseline.Exposure2012 + 0.25))
    return intended
end

local function receiptTarget(target)
    return {
        identity = Core.deepCopy(target.identity),
        localResult = Core.deepCopy(target.localResult),
        baselineSnapshot = Core.toJson(target.baseline),
        intendedSnapshot = Core.toJson(target.intended),
        sourceMaster = target.sourceMaster and {
            identity = Core.deepCopy(target.sourceMaster.identity),
            baselineSnapshot = Core.toJson(target.sourceMaster.baseline),
        } or nil,
    }
end

local function writeReceipt(sdk, job, name, operation, details)
    local targets = {}
    for _, target in ipairs(job.targets) do targets[#targets + 1] = receiptTarget(target) end
    local receipt = {
        schema = CloudCore.VERSION,
        operation = operation,
        at = sdk.now(),
        jobPath = job.jobPath,
        catalogPath = job.permit.catalogPath,
        permit = Core.deepCopy(job.permit),
        targets = targets,
        localResult = Core.deepCopy(job.localResult),
        cloudObservation = { status = 'unverified' },
        details = details,
    }
    sdk.writeFile(join(job.jobPath, name), Core.toJson(receipt))
end

local function save(sdk, job)
    job.updatedAt = sdk.now()
    sdk.saveCloudJob(job)
end

local function protected(sdk, callback)
    local ok, result = sdk.protect(callback)
    if ok then return true, result end
    return false, tostring(result)
end

local function compact(job, status, error)
    return {
        status = status,
        jobPath = job and job.jobPath or nil,
        jobId = job and job.jobId or nil,
        error = error,
        cloudObservation = 'unverified',
    }
end

local function permittedRecords(sdk, permit)
    local selected = {}
    for _, uuid in ipairs(permit.photoUuids) do
        local photo = sdk.findPhotoByUuid(uuid)
        if not photo then fail('Permitted photo has not arrived: ' .. uuid) end
        local info = sdk.photoInfo(photo)
        assertImageTarget(info, 'Permitted target')
        if info.uuid ~= uuid then fail('SDK resolved a different photo for ' .. uuid) end
        if info.isVirtualCopy and permit.uuidSet[info.masterUuid] then
            fail('A virtual-copy master cannot also be a permitted edit target.')
        end
        selected[uuid] = { photo = photo, info = identity(info) }
    end
    return selected
end

local function assertJob(job, permit)
    if type(job) ~= 'table' or job.version ~= CloudCore.VERSION or type(job.targets) ~= 'table'
        or type(job.jobPath) ~= 'string' or not samePermit(job.permit, permit) then
        fail('Saved cloud-return job does not match this permit.')
    end
    local found, count = {}, 0
    for _, target in ipairs(job.targets) do
        if type(target) ~= 'table' or type(target.identity) ~= 'table'
            or type(target.baseline) ~= 'table' or type(target.intended) ~= 'table'
            or type(target.localResult) ~= 'table' then
            fail('Saved cloud-return job has an incomplete target record.')
        end
        if type(target.identity.uuid) ~= 'string' or not isAbsolutePath(target.identity.path)
            or not permit.uuidSet[target.identity.uuid] or found[target.identity.uuid] then
            fail('Saved cloud-return job has an unauthorized or duplicate target.')
        end
        if not Core.sameRecipe(target.intended, intendedRecipe(target.baseline, target.identity.uuid)) then
            fail('Saved cloud-return job intended recipe is inconsistent with its baseline.')
        end
        if target.identity.isVirtualCopy then
            local master = target.sourceMaster
            if type(master) ~= 'table' or type(master.identity) ~= 'table' or type(master.baseline) ~= 'table'
                or master.identity.uuid ~= target.identity.masterUuid or master.identity.isVirtualCopy
                or permit.uuidSet[master.identity.uuid] then
                fail('Saved virtual-copy master protection is incomplete.')
            end
        end
        found[target.identity.uuid] = true
        count = count + 1
    end
    local _, permitCount = uuidSet(permit.photoUuids, 'Permit photoUuids')
    if count ~= permitCount then fail('Saved cloud-return job target set is incomplete.') end
    for uuid in pairs(permit.uuidSet) do
        if not found[uuid] then fail('Saved cloud-return job is missing permitted UUID ' .. uuid .. '.') end
    end
end

local function resolveTarget(sdk, target)
    local photo = sdk.findPhotoByUuid(target.identity.uuid)
    if not photo then fail('Saved target is no longer resolvable: ' .. target.identity.uuid) end
    local info = sdk.photoInfo(photo)
    assertImageTarget(info, 'Saved target')
    local actual = identity(info)
    if not sameIdentity(target.identity, actual) then
        fail('Saved target identity or path changed: ' .. target.identity.uuid)
    end
    return photo
end

local function assertMasterUnchanged(sdk, target)
    if not target.identity.isVirtualCopy then return end
    local saved = target.sourceMaster
    local master = sdk.findPhotoByUuid(target.identity.masterUuid)
    if not master then fail('Virtual-copy source master is unavailable.') end
    local info = sdk.photoInfo(master)
    assertImageTarget(info, 'Source master')
    if not sameIdentity(saved.identity, identity(info)) or not Core.sameRecipe(saved.baseline, sdk.readSettings(master)) then
        fail('Virtual-copy source master changed; refusing to continue.')
    end
end

local function assertJobCatalog(sdk, job, permit)
    assertCatalog(sdk, permit)
    assertJob(job, permit)
end

local function applyOne(sdk, job, permit, target)
    local photo = resolveTarget(sdk, target)
    assertMasterUnchanged(sdk, target)
    local current = sdk.readSettings(photo)
    if Core.sameRecipe(current, target.intended) then
        target.localResult.apply = { state = 'applied', mode = 'already-intended', at = sdk.now() }
        save(sdk, job)
        return true
    end
    if not Core.sameRecipe(current, target.baseline) then
        fail('Target recipe is not the captured baseline: ' .. target.identity.uuid)
    end

    target.localResult.apply = { state = 'attempted', at = sdk.now() }
    save(sdk, job)
    local ok, message = protected(sdk, function()
        local result = sdk.withWriteAccess('Cloud return: Exposure2012 +0.25 ' .. target.identity.uuid, function()
            assertJobCatalog(sdk, job, permit)
            local gated = resolveTarget(sdk, target)
            assertMasterUnchanged(sdk, target)
            if not Core.sameRecipe(sdk.readSettings(gated), target.baseline) then
                fail('Target recipe changed while waiting for write access: ' .. target.identity.uuid)
            end
            sdk.applySettings(gated, { Exposure2012 = target.intended.Exposure2012 }, 'Cloud return: Exposure2012 +0.25')
        end)
        if result ~= 'executed' then fail('Write access was not executed: ' .. tostring(result)) end
    end)

    local readOk, readback = protected(sdk, function()
        assertMasterUnchanged(sdk, target)
        return sdk.readSettings(resolveTarget(sdk, target))
    end)
    if readOk and Core.sameRecipe(readback, target.intended) then
        if not Core.onlyExposureChanged(target.baseline, readback, target.intended.Exposure2012) then
            fail('Exposure write changed more than Exposure2012 for ' .. target.identity.uuid)
        end
        target.localResult.apply = {
            state = 'applied',
            mode = ok and 'written' or 'recovered-after-sdk-error',
            at = sdk.now(),
        }
        save(sdk, job)
        return true
    end

    target.localResult.apply = { state = 'error', at = sdk.now(), error = ok and tostring(readback) or message }
    save(sdk, job)
    return false, ok and tostring(readback) or message
end

local function restoreOne(sdk, job, permit, target)
    local photo = resolveTarget(sdk, target)
    assertMasterUnchanged(sdk, target)
    local current = sdk.readSettings(photo)
    if Core.sameRecipe(current, target.baseline) then
        target.localResult.restore = { state = 'restored', mode = 'already-baseline', at = sdk.now() }
        save(sdk, job)
        return true
    end
    if not Core.sameRecipe(current, target.intended) then
        fail('Target recipe has an unknown intervening change: ' .. target.identity.uuid)
    end

    target.localResult.restore = { state = 'attempted', at = sdk.now() }
    save(sdk, job)
    local ok, message = protected(sdk, function()
        local result = sdk.withWriteAccess('Cloud return: restore ' .. target.identity.uuid, function()
            assertJobCatalog(sdk, job, permit)
            local gated = resolveTarget(sdk, target)
            assertMasterUnchanged(sdk, target)
            if not Core.sameRecipe(sdk.readSettings(gated), target.intended) then
                fail('Target recipe changed while waiting for restore access: ' .. target.identity.uuid)
            end
            sdk.applySettings(gated, Core.deepCopy(target.baseline), 'Cloud return: restore baseline')
        end)
        if result ~= 'executed' then fail('Write access was not executed: ' .. tostring(result)) end
    end)

    local readOk, readback = protected(sdk, function()
        assertMasterUnchanged(sdk, target)
        return sdk.readSettings(resolveTarget(sdk, target))
    end)
    if readOk and Core.sameRecipe(readback, target.baseline) then
        target.localResult.restore = {
            state = 'restored',
            mode = ok and 'written' or 'recovered-after-sdk-error',
            at = sdk.now(),
        }
        save(sdk, job)
        return true
    end

    target.localResult.restore = { state = 'error', at = sdk.now(), error = ok and tostring(readback) or message }
    save(sdk, job)
    return false, ok and tostring(readback) or message
end

local function photosForRender(sdk, job)
    local photos = {}
    for _, target in ipairs(job.targets) do photos[#photos + 1] = resolveTarget(sdk, target) end
    return photos
end

local function optionalRender(sdk, job, stage)
    if type(sdk.render) ~= 'function' then return { status = 'not-supported' } end
    local ok, result = protected(sdk, function()
        return sdk.render(photosForRender(sdk, job), join(job.jobPath, stage), stage)
    end)
    return ok and { status = 'rendered', outputs = result } or { status = 'error', error = result }
end

local function recordFailure(sdk, job, operation, message, validated)
    local touched = false
    if validated then
        for _, target in ipairs(job.targets) do
            local progress = target.localResult[operation]
            if progress and progress.state ~= 'pending' then touched = true end
        end
    end
    if not touched then return compact(job, 'refused', message) end
    -- A later stale target must not hide an earlier successful write.
    job.status = operation .. '-partial'
    job.localResult[operation] = { status = 'partial', error = message, at = sdk.now() }
    local saved, saveError = protected(sdk, function()
        save(sdk, job)
        writeReceipt(sdk, job, operation .. '-receipt.json', operation, job.localResult[operation])
    end)
    if not saved then message = message .. '; progress receipt failed: ' .. saveError end
    return compact(job, 'partial', message)
end

function CloudCore.capture(sdk, permitValue)
    local permit
    local ok, result = protected(sdk, function()
        permit = validatePermit(permitValue)
        assertCatalog(sdk, permit)
        local existing = sdk.loadCloudJob()
        if existing and existing.status ~= 'restored' then
            fail('An unresolved cloud-return job already exists; restore it before capture.')
        end
        local selected = permittedRecords(sdk, permit)
        local jobId = sdk.runId()
        local job = {
            version = CloudCore.VERSION,
            jobId = jobId,
            jobPath = join(permit.evidenceRoot, jobId),
            permit = { catalogPath = permit.catalogPath, evidenceRoot = permit.evidenceRoot, photoUuids = copyArray(permit.photoUuids) },
            createdAt = sdk.now(),
            status = 'captured',
            cloudObservation = { status = 'unverified' },
            localResult = { capture = 'captured' },
            targets = {},
        }
        sdk.mkdir(job.jobPath)
        for _, uuid in ipairs(permit.photoUuids) do
            local record = selected[uuid]
            local baseline = Core.deepCopy(sdk.readSettings(record.photo))
            local target = {
                identity = record.info,
                baseline = baseline,
                intended = intendedRecipe(baseline, uuid),
                localResult = { apply = { state = 'pending' }, restore = { state = 'pending' } },
            }
            if record.info.isVirtualCopy then
                local master = sdk.findPhotoByUuid(record.info.masterUuid)
                if not master then fail('Virtual-copy source master is unavailable.') end
                local info = sdk.photoInfo(master)
                assertImageTarget(info, 'Source master')
                if info.uuid ~= record.info.masterUuid or info.isVirtualCopy then fail('Invalid source master identity.') end
                target.sourceMaster = { identity = identity(info), baseline = Core.deepCopy(sdk.readSettings(master)) }
            end
            job.targets[#job.targets + 1] = target
        end
        save(sdk, job)
        local render = optionalRender(sdk, job, 'baseline')
        job.localResult.baselineRender = render
        save(sdk, job)
        writeReceipt(sdk, job, 'baseline-receipt.json', 'capture', { render = render })
        return job
    end)
    if not ok then return compact(nil, 'refused', result) end
    return compact(result, 'captured')
end

function CloudCore.apply(sdk, permitValue)
    local permit, job, validated
    local ok, result = protected(sdk, function()
        permit = validatePermit(permitValue)
        assertCatalog(sdk, permit)
        job = sdk.loadCloudJob()
        assertJob(job, permit)
        if job.status == 'restored' then fail('The saved job is already restored; capture a new job to apply again.') end
        validated = true

        for _, target in ipairs(job.targets) do
            local applied, message = applyOne(sdk, job, permit, target)
            if not applied then
                job.status = 'apply-partial'
                job.localResult.apply = { status = 'partial', error = message, at = sdk.now() }
                save(sdk, job)
                writeReceipt(sdk, job, 'apply-receipt.json', 'apply', { status = 'partial', error = message })
                return compact(job, 'partial', message)
            end
        end
        job.status = 'applied'
        job.localResult.apply = { status = 'applied', at = sdk.now() }
        save(sdk, job)
        local render = optionalRender(sdk, job, 'edited')
        job.localResult.editedRender = render
        save(sdk, job)
        writeReceipt(sdk, job, 'apply-receipt.json', 'apply', { status = 'applied', render = render })
        return compact(job, 'applied')
    end)
    if not ok then return recordFailure(sdk, job, 'apply', result, validated) end
    return result
end

function CloudCore.restore(sdk, permitValue)
    local permit, job, validated
    local ok, result = protected(sdk, function()
        permit = validatePermit(permitValue)
        assertCatalog(sdk, permit)
        job = sdk.loadCloudJob()
        assertJob(job, permit)
        validated = true

        for _, target in ipairs(job.targets) do
            local restored, message = restoreOne(sdk, job, permit, target)
            if not restored then
                job.status = 'restore-partial'
                job.localResult.restore = { status = 'partial', error = message, at = sdk.now() }
                save(sdk, job)
                writeReceipt(sdk, job, 'restore-receipt.json', 'restore', { status = 'partial', error = message })
                return compact(job, 'partial', message)
            end
        end
        job.status = 'restored'
        job.localResult.restore = { status = 'restored', at = sdk.now() }
        save(sdk, job)
        local render = optionalRender(sdk, job, 'restored')
        job.localResult.restoredRender = render
        save(sdk, job)
        writeReceipt(sdk, job, 'restore-receipt.json', 'restore', { status = 'restored', render = render })
        return compact(job, 'restored')
    end)
    if not ok then return recordFailure(sdk, job, 'restore', result, validated) end
    return result
end

return CloudCore
