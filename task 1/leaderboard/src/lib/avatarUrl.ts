/** Abstract SVG avatars — no real photos; seed ties image to synthetic id */
export function avatarUrl(seed: string): string {
  const s = encodeURIComponent(seed)
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${s}`
}
