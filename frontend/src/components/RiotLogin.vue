<template>
  <div class="min-h-screen bg-gradient-to-br from-[#0078d4] to-[#005a9e] flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo/Header -->
      <div class="text-center mb-8">
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center text-4xl">
          ⚔️
        </div>
        <h1 class="text-4xl font-bold text-white mb-2">Smurf Manager</h1>
        <p class="text-blue-100">League of Legends Account Manager</p>
      </div>

      <!-- Card -->
      <div class="bg-white dark:bg-[#202020] rounded-2xl shadow-2xl p-8 space-y-6">
        <!-- Title -->
        <div class="text-center">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Connexion</h2>
          <p class="text-gray-500 dark:text-gray-400">Connectez-vous à votre compte</p>
        </div>

        <!-- Form -->
        <form @submit.prevent="handleLogin" class="space-y-4">
          <!-- Username -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Identifiant
            </label>
            <input
              v-model="username"
              type="text"
              placeholder="Entrez votre identifiant"
              class="input-base"
              required
            />
          </div>

          <!-- Password -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mot de passe
            </label>
            <input
              v-model="password"
              type="password"
              placeholder="Entrez votre mot de passe"
              class="input-base"
              required
            />
          </div>

          <!-- Error Message -->
          <div v-if="error" class="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm">
            {{ error }}
          </div>

          <!-- Login Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-[#0078d4] to-[#005a9e] hover:from-[#005a9e] hover:to-[#004578] text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg v-if="loading" class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <span v-else>Se connecter</span>
            <span v-if="loading">Connexion en cours...</span>
          </button>
        </form>

        <!-- Divider -->
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-200 dark:border-gray-700"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-white dark:bg-[#202020] text-gray-500 dark:text-gray-400">ou</span>
          </div>
        </div>

        <!-- Riot Client Button -->
        <button
          @click="handleRiotClientLogin"
          :disabled="loading"
          class="w-full px-4 py-3 rounded-lg border-2 border-[#0078d4] text-[#0078d4] dark:text-white dark:border-[#0078d4] font-semibold transition-all hover:bg-[#f0f7ff] dark:hover:bg-[#1a2332] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
          </svg>
          Connexion Riot Client
        </button>

        <!-- Demo Credentials -->
        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p class="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2">Identifiants de démo :</p>
          <p class="text-xs text-amber-700 dark:text-amber-300">
            <span class="font-mono">admin</span> / <span class="font-mono">admin123</span>
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="text-center mt-8 text-blue-100 text-sm">
        <p>Version 2.0 - Windows Edition</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const emit = defineEmits(['login-success'])

const API_URL = '/api'

const handleLogin = async () => {
  if (!username.value || !password.value) {
    error.value = 'Veuillez remplir tous les champs'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: username.value,
        password: password.value
      })
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Erreur de connexion')
    }

    const data = await res.json()
    emit('login-success', data)
  } catch (e) {
    error.value = e.message || 'Erreur lors de la connexion'
    console.error(e)
  } finally {
    loading.value = false
  }
}

const handleRiotClientLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    // Appel Electron pour extraire le token du Riot Client
    if (window.electronAPI?.extractRiotTokens) {
      const result = await window.electronAPI.extractRiotTokens()
      
      if (result.success) {
        // Authentifier l'utilisateur avec le token
        const res = await fetch(`${API_URL}/auth/riot-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            riot_token: result.tokens.riot_token,
            riot_entitlements: result.tokens.riot_entitlements
          })
        })

        if (!res.ok) {
          throw new Error('Erreur lors de l\'authentification')
        }

        const data = await res.json()
        emit('login-success', data)
      } else {
        throw new Error(result.error || 'Impossible d\'extraire les tokens')
      }
    } else {
      error.value = 'Cette fonctionnalité nécessite l\'application Electron'
    }
  } catch (e) {
    error.value = e.message || 'Erreur lors de la connexion Riot'
    console.error(e)
  } finally {
    loading.value = false
  }
}
</script>
