return {
    LrSdkVersion = 6.0,
    LrToolkitIdentifier = 'co.ninochavez.photo-editing-roundtrip',
    LrPluginName = 'Photo Editing Round-trip Probe',
    LrPluginInfoUrl = 'https://developer.adobe.com/lightroom-classic/',
    LrLibraryMenuItems = {
        {
            title = 'Photo Editing: Export selected recipes',
            file = 'ExportRecipes.lua',
        },
        {
            title = 'Photo Editing: Run bounded round-trip probe',
            file = 'RunRoundTripProbe.lua',
        },
        { title = 'Photo Editing: Capture cloud test baseline', file = 'CaptureCloudBaseline.lua' },
        { title = 'Photo Editing: Apply cloud test exposure', file = 'ApplyCloudExposure.lua' },
        { title = 'Photo Editing: Restore cloud test baseline', file = 'RestoreCloudBaseline.lua' },
    },
    VERSION = {
        major = 0,
        minor = 1,
        revision = 0,
        build = 3,
    },
}
