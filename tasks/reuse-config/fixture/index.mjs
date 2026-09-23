export function resolveConfig(defaults, user) {
  return { ...user, ...defaults, flags: { ...user.flags, ...defaults.flags } }
}
