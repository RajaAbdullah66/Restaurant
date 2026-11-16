import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url))
const defaultStaticDirectory = resolve(moduleDirectory, '..', 'dist')
const port = Number(process.env.MEHFIL_PORT || 47821)
const maxBodyBytes = 10 * 1024 * 1024

function getOrCreateToken(dataDirectory) {
  const tokenPath = join(dataDirectory, 'sync-token.txt')
  if (existsSync(tokenPath)) {
    const token = readFileSync(tokenPath, 'utf8').trim()
    if (token.length < 32) throw new Error(`Sync token in ${tokenPath} must contain at least 32 characters.`)
    return token
  }

  const token = randomBytes(32).toString('base64url')
  writeFileSync(tokenPath, `${token}\n`, { flag: 'wx', mode: 0o600 })
  console.log(`Created sync access token. Copy it from: ${tokenPath}`)
  return token
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function isValidSnapshotPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    payload.restaurantData &&
    Array.isArray(payload.restaurantData.menu) &&
    Array.isArray(payload.restaurantData.orders) &&
    Array.isArray(payload.restaurantData.expenses) &&
    payload.restaurantData.settings &&
    Array.isArray(payload.inventory),
  )
}

async function readJsonBody(request) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of request) {
    totalBytes += chunk.length
    if (totalBytes > maxBodyBytes) throw Object.assign(new Error('Request body is too large.'), { status: 413 })
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })
  }
}

function getMimeType(path) {
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.woff2': 'font/woff2',
  })[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function serveStaticFile(request, response, staticDirectory) {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  const relativePath = requestPath === '/' ? 'index.html' : normalize(requestPath).replace(/^[/\\]+/, '')
  const filePath = resolve(staticDirectory, relativePath)
  if (filePath !== staticDirectory && !filePath.startsWith(`${staticDirectory}${sep}`)) {
    sendJson(response, 403, { error: 'Forbidden.' })
    return
  }

  if (!existsSync(filePath)) {
    if (requestPath.startsWith('/assets/')) {
      sendJson(response, 404, { error: 'Asset not found.' })
      return
    }
    const indexPath = join(staticDirectory, 'index.html')
    if (existsSync(indexPath)) {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      createReadStream(indexPath).pipe(response)
      return
    }
    sendJson(response, 503, { error: 'Built app not found. Run npm run build first.' })
    return
  }

  response.writeHead(200, {
    'Content-Type': getMimeType(filePath),
    'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  createReadStream(filePath).pipe(response)
}

export function startServer({
  host = process.env.MEHFIL_HOST || '0.0.0.0',
  port: serverPort = port,
  dataDirectory = process.env.MEHFIL_DATA_DIR || resolve(process.cwd(), 'data'),
  staticDirectory = defaultStaticDirectory,
} = {}) {
  mkdirSync(dataDirectory, { recursive: true })
  const syncToken = getOrCreateToken(dataDirectory)
  const database = new DatabaseSync(join(dataDirectory, 'restaurant.sqlite'))
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS restaurant_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  const getSnapshot = database.prepare(
    'SELECT revision, payload, updated_at AS updatedAt FROM restaurant_snapshot WHERE id = 1',
  )
  const saveSnapshot = database.prepare(`
    INSERT INTO restaurant_snapshot (id, revision, payload, updated_at)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      revision = excluded.revision,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `)

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
    if (requestUrl.pathname === '/api/health' && request.method === 'GET') {
      sendJson(response, 200, { ok: true, service: 'mehfil-sync', version: 1 })
      return
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      const providedToken = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? ''
      const provided = Buffer.from(providedToken)
      const expected = Buffer.from(syncToken)
      const authorized = provided.length === expected.length && timingSafeEqual(provided, expected)
      if (!authorized) {
        sendJson(response, 401, { error: 'Sync authorization failed. Check the sync access token.' })
        return
      }

      if (requestUrl.pathname === '/api/sync' && request.method === 'GET') {
        const row = getSnapshot.get()
        sendJson(response, 200, row
          ? { revision: row.revision, payload: JSON.parse(row.payload), updatedAt: row.updatedAt }
          : { revision: 0, payload: null, updatedAt: null })
        return
      }

      if (requestUrl.pathname === '/api/sync' && request.method === 'PUT') {
        try {
          const body = await readJsonBody(request)
          if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !isValidSnapshotPayload(body.payload)) {
            sendJson(response, 400, { error: 'A valid expectedRevision and restaurant snapshot are required.' })
            return
          }

          const row = getSnapshot.get()
          const currentRevision = row?.revision ?? 0
          if (currentRevision !== body.expectedRevision) {
            sendJson(response, 409, {
              error: 'The server has newer data. Review the conflict before syncing.',
              revision: currentRevision,
              payload: row ? JSON.parse(row.payload) : null,
              updatedAt: row?.updatedAt ?? null,
            })
            return
          }

          const updatedAt = new Date().toISOString()
          const revision = currentRevision + 1
          saveSnapshot.run(revision, JSON.stringify(body.payload), updatedAt)
          sendJson(response, 200, { revision, payload: body.payload, updatedAt })
          return
        } catch (error) {
          sendJson(response, error?.status ?? 500, { error: error instanceof Error ? error.message : 'Sync request failed.' })
          return
        }
      }

      sendJson(response, 404, { error: 'API route not found.' })
      return
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed.' })
      return
    }

    serveStaticFile(request, response, staticDirectory)
  })

  server.listen(serverPort, host, () => {
    console.log(`Mehfil restaurant server listening at http://${host}:${serverPort}`)
  })
  server.on('close', () => database.close())
  return server
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer()
}
