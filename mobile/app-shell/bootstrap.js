import { api, request, API_BASE, onAuthLost, fileToDataUrl } from './api.js'
import { createAppApi } from './app-api.js'
import { initialize } from './integration.js'
import { mountFeatures } from './features.js'
initialize({ api: createAppApi(api, request), API_BASE, onAuthLost, fileToDataUrl, mountFeatures })
