// The Hype mark, as shown on the sign-in and first-launch screens. The file is public/logo.svg, the vector
// master of the app icon, so it stays sharp at any size; the path is relative like index.html's own links, so a subpath deployment finds it.
export default function Logo({ size = 96 }) {
  return <img src="logo.svg" alt="" width={size} height={size}
    style={{ display: 'block', margin: '0 auto', borderRadius: '22%', boxShadow: '0 0 36px color-mix(in srgb, var(--hype-2) 45%, transparent)' }} />
}
