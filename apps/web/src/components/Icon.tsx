/** Prototype Trae icons served from /public/icons */
export function Icon({
  name,
  size = 16,
  className,
  alt = '',
}: {
  name: string
  size?: number
  className?: string
  alt?: string
}) {
  return (
    <img
      src={`/icons/${name}.svg`}
      width={size}
      height={size}
      alt={alt}
      className={className}
    />
  )
}
