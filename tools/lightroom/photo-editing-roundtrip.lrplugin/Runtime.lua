local LrApplication = import 'LrApplication'
local LrDialogs = import 'LrDialogs'
local LrExportSession = import 'LrExportSession'
local LrFileUtils = import 'LrFileUtils'
local LrPathUtils = import 'LrPathUtils'
local LrPrefs = import 'LrPrefs'
local LrTasks = import 'LrTasks'

local Core = require 'Core'
local CloudCore = require 'CloudCore'
local Runtime = {}

local function path(root, child)
    return LrPathUtils.child(root, child)
end

local function writeFile(filePath, contents)
    local handle, message = io.open(filePath, 'wb')
    if not handle then error('Could not write ' .. filePath .. ': ' .. tostring(message), 0) end
    local written, writeMessage = handle:write(contents)
    handle:close()
    if not written then error('Could not write ' .. filePath .. ': ' .. tostring(writeMessage), 0) end
end

local function photoInfo(photo)
    local raw = photo:getRawMetadata()
    local master = raw.isVirtualCopy and photo:getRawMetadata('masterPhoto') or nil
    return {
        uuid = raw.uuid,
        path = raw.path,
        masterUuid = master and master:getRawMetadata('uuid') or nil,
        isVirtualCopy = raw.isVirtualCopy == true,
        isVideo = raw.isVideo == true,
        fileFormat = raw.fileFormat,
        available = photo:checkPhotoAvailability(),
    }
end

local function exportSettings(destination)
    -- Values captured from Classic 15.5.1's saved 2048 HDR export preset.
    -- The SDK uses the LR_ prefix; actual HDR output is checked separately.
    return {
        LR_export_destinationType = 'specificFolder',
        LR_export_destinationPathPrefix = destination,
        LR_export_useSubfolder = false,
        LR_collisionHandling = 'rename',
        LR_format = 'JPEG',
        LR_jpeg_quality = 1,
        LR_jpeg_useLimitSize = false,
        LR_export_colorSpace = 'sRGB_hdr',
        LR_export_bitDepth = 8,
        LR_enableHDRDisplay = true,
        LR_maximumCompatibility = true,
        LR_contentCredentials_include_status = 'exclude',
        LR_embeddedMetadataOption = 'all',
        LR_removeFaceMetadata = false,
        LR_removeLocationMetadata = false,
        LR_renamingTokensOn = false,
        LR_reimportExportedPhoto = false,
        LR_export_postProcessing = 'doNothing',
        LR_size_doConstrain = true,
        LR_size_resizeType = 'wh',
        LR_size_doNotEnlarge = true,
        LR_size_maxWidth = 2048,
        LR_size_maxHeight = 2048,
        LR_size_units = 'pixels',
        LR_size_resolution = 240,
        LR_size_resolutionUnits = 'inch',
        LR_outputSharpeningOn = false,
        LR_useWatermark = false,
    }
end

local function buildSdk()
    local catalog = LrApplication.activeCatalog()
    return {
        homePath = function() return LrPathUtils.getStandardFilePath('home') end,
        catalogPath = function() return LrApplication.activeCatalog():getPath() end,
        protect = LrTasks.pcall,
        targetPhotos = function() return catalog:getTargetPhotos() end,
        findPhotoByUuid = function(uuid) return catalog:findPhotoByUuid(uuid) end,
        photoInfo = photoInfo,
        readSettings = function(photo) return photo:getDevelopSettings() end,
        applySettings = function(photo, settings, historyName)
            photo:applyDevelopSettings(settings, historyName, false)
        end,
        withWriteAccess = function(historyName, action)
            return catalog:withWriteAccessDo(historyName, action, { timeout = 10 })
        end,
        createVirtualCopies = function(copyName) return catalog:createVirtualCopies(copyName) end,
        mkdir = function(directory)
            if LrFileUtils.exists(directory) then error('Job folder already exists; refusing reuse.', 0) end
            LrFileUtils.createAllDirectories(directory)
        end,
        writeFile = writeFile,
        now = function() return os.date('!%Y-%m-%dT%H:%M:%SZ') end,
        runId = function() return 'lr-' .. os.date('!%Y%m%dT%H%M%SZ') .. '-' .. tostring(math.random(100000, 999999)) end,
        applicationVersion = function() return LrApplication.versionString() end,
        render = function(photos, destination, stage)
            LrFileUtils.createAllDirectories(destination)
            local session = LrExportSession { photosToExport = photos, exportSettings = exportSettings(destination) }
            local outputs = {}
            for _, rendition in session:renditions() do
                local success, result = rendition:waitForRender()
                if not success then error('Render failed during ' .. stage .. ': ' .. tostring(result), 0) end
                outputs[#outputs + 1] = result
            end
            return outputs
        end,
    }
end

local running = false
function Runtime.run(operation)
    if running then
        LrDialogs.message('Photo Editing Round-trip Probe', 'A pilot operation is already running.', 'info')
        return
    end
    running = true
    LrTasks.startAsyncTask(function()
        local ok, result = LrTasks.pcall(function() return operation(buildSdk()) end)
        running = false
        if ok then
            local message = result.status .. '\n' .. (result.receiptPath or result.jobPath or '')
            if result.error then message = message .. '\n' .. result.error end
            LrDialogs.message('Photo Editing Round-trip Probe', message,
                (result.status == 'refused' or result.status == 'partial') and 'warning' or 'info')
        else
            LrDialogs.message('Photo Editing Round-trip Probe stopped', tostring(result), 'critical')
        end
    end)
end

-- This private, non-executable permit is written only after the parent verifies
-- disposable assets. Selection, filenames, and collections cannot authorize edits.
local function readCloudPermit(sdk)
    local filePath = path(sdk.homePath(), 'Pictures/Photo Editing Pilot/2026-09-26/cloud-return-permit.txt')
    local handle = io.open(filePath, 'rb')
    if not handle then error('Cloud-return permit is absent: ' .. filePath, 0) end
    local permit = { photoUuids = {} }
    for line in handle:lines() do
        line = line:gsub('\r$', '')
        local key, value = line:match('^([%a]+)=(.+)$')
        if key == 'catalogPath' and not permit.catalogPath then permit.catalogPath = value
        elseif key == 'evidenceRoot' and not permit.evidenceRoot then permit.evidenceRoot = value
        elseif key == 'uuid' then permit.photoUuids[#permit.photoUuids + 1] = value
        else handle:close(); error('Invalid or duplicate field in cloud-return permit.', 0) end
    end
    handle:close()
    return permit
end

function Runtime.runCloud(operation)
    Runtime.run(function(sdk)
        local permit = readCloudPermit(sdk)
        local prefs = LrPrefs.prefsForPlugin()
        sdk.loadCloudJob = function() return Core.deepCopy(prefs.cloudReturnJob) end
        sdk.saveCloudJob = function(job)
            -- Reassign the root: LrPrefs does not reliably observe nested mutation.
            prefs.cloudReturnJob = Core.deepCopy(job)
            if not Core.sameRecipe(prefs.cloudReturnJob, job) then
                error('Lightroom preferences did not preserve the cloud-return job.', 0)
            end
        end
        return operation(sdk, permit)
    end)
end

Runtime.Core = Core
Runtime.CloudCore = CloudCore
return Runtime
