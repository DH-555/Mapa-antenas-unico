import { readFileSync } from 'fs'
import { join } from 'path'
import { existsSync } from 'fs'

const mimeTypes = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.txt': 'text/plain',
  '.html': 'text/html',
}

function getMimeType(filePath) {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  return mimeTypes[ext] || 'application/octet-stream'
}

export async function GET({ params }) {
  try {
    // Construir la ruta del archivo desde los parámetros dinámicos
    const filePath = join(process.cwd(), 'public', params.path || '')
    
    // Verificar que el archivo existe
    if (!existsSync(filePath)) {
      return new Response('Not Found', { status: 404 })
    }
    
    // Leer el archivo
    const data = readFileSync(filePath)
    const mimeType = getMimeType(filePath)
    
    return new Response(data, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400'
      }
    })
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 })
  }
}
