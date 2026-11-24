/** Cloudflare Pages Function: GET /api/live-status?code=<WCL_CODE> */

import {
  buildCorsHeaders,
  fetchLiveStatus,
  jsonResponse,
  validateReportCode,
  type WclEnv,
} from '../_shared/wcl'

interface PagesContext {
  request: Request
  env: WclEnv
  waitUntil: (promise: Promise<unknown>) => void
}

export const onRequestOptions = () =>
  new Response(null, { status: 204, headers: buildCorsHeaders() })

export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const url = new URL(context.request.url)
  const code = validateReportCode(url.searchParams.get('code'))
  if (!code) {
    return jsonResponse(
      { error: 'Ungültiger WarcraftLogs Report-Code. Bitte URL oder 16-stelligen Code angeben.' },
      400,
    )
  }

  const bypassCache = url.searchParams.get('nocache') === '1'
  const cacheKeyUrl = new URL(url.origin + '/api/live-status')
  cacheKeyUrl.searchParams.set('code', code)
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' })
  const edgeCache = (caches as unknown as { default?: Cache }).default

  if (!bypassCache && edgeCache) {
    const cached = await edgeCache.match(cacheKey)
    if (cached) {
      const hitHeaders = new Headers(cached.headers)
      hitHeaders.set('X-Cache', 'HIT')
      return new Response(cached.body, { status: cached.status, headers: hitHeaders })
    }
  }

  try {
    const status = await fetchLiveStatus(context.env, code)
    // Cache live status for 20s so even 20 raiders polling every 30s only hit WCL ~1x per 20-30s
    const ttl = status.is_live ? 20 : 60
    const resp = jsonResponse(status, 200, {
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
      'X-Cache': 'MISS',
    })
    if (edgeCache) {
      context.waitUntil(edgeCache.put(cacheKey, resp.clone()))
    }
    return resp
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: msg }, 502, { 'Cache-Control': 'no-store' })
  }
}
