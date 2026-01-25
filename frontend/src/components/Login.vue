<template>
  <div class="login-container">
    <!-- Background Effects -->
    <div class="bg-effects">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
      <div class="gradient-orb orb-3"></div>
    </div>

    <!-- Login Card -->
    <div class="login-card animate-fadeInScale">
      <!-- Logo -->
      <div class="login-header">
        <div class="logo-wrapper">
          <div class="logo-icon-box">SV</div>
          <div class="logo-glow"></div>
        </div>
        <h1 class="login-title">Savana</h1>
        <p class="login-subtitle">{{ isRegister ? 'Create your account' : 'Welcome back' }}</p>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="login-form">
        <div class="form-group">
          <label class="form-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Username
          </label>
          <input 
            v-model="username" 
            type="text" 
            class="form-input input"
            placeholder="Enter your username" 
            required
            autocomplete="username"
          >
        </div>

        <div class="form-group">
          <label class="form-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            Password
          </label>
          <div class="password-wrapper">
            <input 
              v-model="password" 
              :type="showPassword ? 'text' : 'password'" 
              class="form-input input"
              placeholder="Enter your password" 
              required
              autocomplete="current-password"
            >
            <button 
              type="button" 
              class="password-toggle" 
              @click="showPassword = !showPassword"
            >
              <svg v-if="showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="error-message animate-fadeIn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {{ error }}
        </div>

        <!-- Submit Button -->
        <button type="submit" class="submit-btn btn btn-primary" :disabled="loading">
          <span v-if="loading" class="loading-spinner"></span>
          <span v-else>
            {{ isRegister ? 'Create Account' : 'Sign In' }}
          </span>
          <svg v-if="!loading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </form>

      <!-- Toggle Mode -->
      <div class="login-footer">
        <p>{{ isRegister ? 'Already have an account?' : "Don't have an account?" }}</p>
        <button @click="isRegister = !isRegister" class="toggle-btn">
          {{ isRegister ? 'Sign In' : 'Create Account' }}
        </button>
      </div>
    </div>

    <!-- Version Info -->
    <div class="version-info">
      Savana v2.0
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['login-success']);

const username = ref('');
const password = ref('');
const isRegister = ref(false);
const loading = ref(false);
const error = ref('');
const showPassword = ref(false);

const API_URL = '/api';

const handleSubmit = async () => {
  loading.value = true;
  error.value = '';

  try {
    const endpoint = isRegister.value ? '/auth/register' : '/auth/login';
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: username.value,
        password: password.value
      })
    });

    const data = await res.json();

    if (!res.ok) {
      error.value = data.error || 'Authentication failed';
      return;
    }

    emit('login-success', data);
  } catch (e) {
    error.value = 'Server error. Is the backend running?';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  position: relative;
  overflow: hidden;
  padding: var(--space-lg);
}

/* Background Effects */
.bg-effects {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.3;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: var(--accent-primary);
  top: -100px;
  right: -100px;
  animation: float 8s ease-in-out infinite;
}

.orb-2 {
  width: 300px;
  height: 300px;
  background: var(--accent-secondary);
  bottom: -50px;
  left: -50px;
  animation: float 10s ease-in-out infinite reverse;
}

.orb-3 {
  width: 200px;
  height: 200px;
  background: var(--success);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: pulse 4s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-30px) rotate(10deg); }
}

/* Login Card */
.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: var(--space-2xl);
  position: relative;
  z-index: 1;
  box-shadow: var(--shadow-lg);
}

/* Header */
.login-header {
  text-align: center;
  margin-bottom: var(--space-xl);
}

.logo-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 0 auto var(--space-lg);
}

.logo-icon-box {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 700;
  color: white;
  background: var(--accent-gradient);
  border-radius: var(--radius-lg);
  position: relative;
  z-index: 1;
}

.logo-glow {
  position: absolute;
  inset: -10px;
  background: var(--accent-gradient);
  border-radius: var(--radius-xl);
  filter: blur(20px);
  opacity: 0.5;
  animation: glow 3s ease-in-out infinite;
}

.login-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--space-xs);
}

.login-subtitle {
  color: var(--text-muted);
  font-size: 0.875rem;
}

/* Form */
.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.form-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-label svg {
  width: 16px;
  height: 16px;
}

.form-input {
  padding: var(--space-md);
  font-size: 1rem;
}

.password-wrapper {
  position: relative;
}

.password-wrapper .form-input {
  padding-right: 48px;
}

.password-toggle {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: var(--space-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--transition-fast);
}

.password-toggle:hover {
  color: var(--text-primary);
}

.password-toggle svg {
  width: 20px;
  height: 20px;
}

/* Error Message */
.error-message {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  color: var(--error);
  font-size: 0.875rem;
}

.error-message svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* Submit Button */
.submit-btn {
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  font-size: 1rem;
  font-weight: 600;
  gap: var(--space-sm);
}

.submit-btn svg {
  width: 18px;
  height: 18px;
}

/* Footer */
.login-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  margin-top: var(--space-xl);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--border-subtle);
}

.login-footer p {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: var(--accent-primary);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  font-size: 0.875rem;
  transition: color var(--transition-fast);
}

.toggle-btn:hover {
  color: var(--accent-secondary);
}

/* Version Info */
.version-info {
  position: fixed;
  bottom: var(--space-md);
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.75rem;
  color: var(--text-muted);
  opacity: 0.5;
}
</style>
