import type { MovementsData, RepoFile, StockData } from '../types'

const owner = import.meta.env.VITE_GITHUB_OWNER ?? 'kikof17'
const repo = import.meta.env.VITE_GITHUB_REPO ?? 'Sergent_Tobogo'
const branch = import.meta.env.VITE_GITHUB_BRANCH ?? 'main'

const repoPaths = {
  products: 'data/stock/products.json',
  movements: 'data/stock/movements.json',
}

type GitHubContentResponse = {
  content: string
  sha: string
}

function toBase64(content: string) {
  const bytes = new TextEncoder().encode(content)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function fromBase64(content: string) {
  const binary = atob(content.replace(/\n/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function buildHeaders(token?: string, contentType = 'application/vnd.github+json') {
  const headers = new Headers({
    Accept: contentType,
    'Content-Type': 'application/json',
  })

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}

async function loadRepoJson<T>(path: string, token?: string): Promise<RepoFile<T>> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    {
      cache: 'no-store',
      headers: buildHeaders(token),
    },
  )

  if (!response.ok) {
    throw new Error(`Lecture GitHub impossible pour ${path}.`)
  }

  const payload = (await response.json()) as GitHubContentResponse
  return {
    sha: payload.sha,
    data: JSON.parse(fromBase64(payload.content)) as T,
  }
}

async function saveRepoJson<T>(input: {
  path: string
  data: T
  sha: string
  token: string
  message: string
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${input.path}`,
    {
      method: 'PUT',
      headers: buildHeaders(input.token),
      body: JSON.stringify({
        message: input.message,
        branch,
        sha: input.sha,
        content: toBase64(`${JSON.stringify(input.data, null, 2)}\n`),
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Sauvegarde GitHub impossible pour ${input.path}.`)
  }

  const payload = (await response.json()) as { content: { sha: string } }
  return payload.content.sha
}

export async function loadStockBundle(token?: string) {
  const [productsFile, movementsFile] = await Promise.all([
    loadRepoJson<StockData>(repoPaths.products, token),
    loadRepoJson<MovementsData>(repoPaths.movements, token),
  ])

  return {
    productsFile,
    movementsFile,
  }
}

export async function saveStockBundle(input: {
  productsFile: RepoFile<StockData>
  movementsFile: RepoFile<MovementsData>
  token: string
}) {
  const now = new Date().toISOString()

  const products = {
    ...input.productsFile.data,
    updatedAt: now,
  }

  const movements = {
    ...input.movementsFile.data,
    updatedAt: now,
  }

  const productsSha = await saveRepoJson({
    path: repoPaths.products,
    data: products,
    sha: input.productsFile.sha,
    token: input.token,
    message: `chore(stock): update products ${now}`,
  })

  const movementsSha = await saveRepoJson({
    path: repoPaths.movements,
    data: movements,
    sha: input.movementsFile.sha,
    token: input.token,
    message: `chore(stock): update movements ${now}`,
  })

  return {
    productsFile: {
      sha: productsSha,
      data: products,
    },
    movementsFile: {
      sha: movementsSha,
      data: movements,
    },
  }
}

export const repoConfig = {
  owner,
  repo,
  branch,
  paths: repoPaths,
}
