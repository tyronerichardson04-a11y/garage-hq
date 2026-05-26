import { supabase } from './supabase.js'

const REDIRECT_URL = import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://garage-hq.netlify.app'

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: REDIRECT_URL },
  })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
  return data.subscription
}

export function getUserDisplayName(user) {
  if (!user) return ''
  return user.user_metadata?.full_name || user.email.split('@')[0]
}

export function getUserInitials(user) {
  if (!user) return '?'
  const name = getUserDisplayName(user)
  return name.slice(0, 2).toUpperCase()
}
