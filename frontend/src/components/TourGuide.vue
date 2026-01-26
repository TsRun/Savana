<template>
  <div v-if="isOpen" class="tour-overlay">
    <div 
      class="tour-highlight" 
      :style="highlightStyle"
    ></div>
    
    <div 
      class="tour-tooltip" 
      :style="tooltipStyle"
    >
      <div class="tour-header">
        <span class="step-counter">{{ currentStep + 1 }}/{{ steps.length }}</span>
        <h3>{{ currentStepData.title }}</h3>
      </div>
      <p class="tour-content">{{ currentStepData.content }}</p>
      
      <div class="tour-actions">
        <button 
          v-if="currentStep > 0" 
          @click="prevStep" 
          class="btn-tour secondary"
        >
          Précédent
        </button>
        <button 
          @click="nextStep" 
          class="btn-tour primary"
        >
          {{ isLastStep ? 'Terminer' : 'Suivant' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';

const isOpen = ref(false);
const currentStep = ref(0);
const targetRect = ref(null);

const steps = [
  {
    target: null, // Center
    title: 'Bienvenue sur Savana',
    content: 'Voici votre nouveau gestionnaire de comptes League of Legends. Prenons un moment pour découvrir les fonctionnalités importantes.'
  },
  {
    target: '.btn-danger-outline',
    title: '⚠️ SUPER IMPORTANT',
    content: 'Pour changer de compte, utilisez TOUJOURS ce bouton "Reset Client". NE VOUS DÉCONNECTEZ JAMAIS DANS LE JEU (Logout), cela invaliderait votre session sauvegardée !'
  },
  {
    target: '.btn-primary',
    title: 'Ajout de compte',
    content: 'Ajoutez vos comptes smurfs ici. Une fois connectés, vous pourrez sauvegarder leur session pour une reconnexion instantanée sans mot de passe.'
  },
  {
    target: '.smurf-card', 
    title: 'Vos Comptes',
    content: 'Chaque carte permet de copier vos identifiants ou de lancer directement le jeu si une session est sauvegardée.'
  }
];

const currentStepData = computed(() => steps[currentStep.value]);
const isLastStep = computed(() => currentStep.value === steps.length - 1);

const highlightStyle = computed(() => {
  if (!targetRect.value) return { display: 'none' };
  return {
    top: `${targetRect.value.top - 5}px`,
    left: `${targetRect.value.left - 5}px`,
    width: `${targetRect.value.width + 10}px`,
    height: `${targetRect.value.height + 10}px`,
  };
});

const tooltipStyle = computed(() => {
  if (!targetRect.value) {
    // Center if no target
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    };
  }
  
  // Position below target by default
  const top = targetRect.value.bottom + 15;
  const left = targetRect.value.left + (targetRect.value.width / 2) - 150; // Center horiz (300px width)
  
  return {
    top: `${top}px`,
    left: `${Math.max(20, left)}px` // Prevent off-screen
  };
});

const updateTarget = async () => {
  const selector = currentStepData.value.target;
  if (!selector) {
    targetRect.value = null;
    return;
  }
  
  await nextTick();
  const el = document.querySelector(selector);
  if (el) {
    targetRect.value = el.getBoundingClientRect();
  } else {
    // If target not found, skip or show centered (fallback)
    targetRect.value = null;
  }
};

const nextStep = () => {
  if (isLastStep.value) {
    finishTour();
  } else {
    currentStep.value++;
    updateTarget();
  }
};

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
    updateTarget();
  }
};

const finishTour = () => {
  localStorage.setItem('savana_tour_completed', 'true');
  isOpen.value = false;
};

onMounted(() => {
  // Check if already completed
  const completed = localStorage.getItem('savana_tour_completed');
  if (!completed) {
    setTimeout(() => {
      isOpen.value = true;
      updateTarget();
    }, 1000); // Wait for UI to settle
  }
});
</script>

<style scoped>
.tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5); /* Dim background */
}

/* Cutout effect via simplified approach: Highlight Box on top of dim */
/* Note: A true cutout needs canvas or massive box-shadows. 
   Here we just use a border to highlight */
.tour-highlight {
  position: absolute;
  border: 2px solid #6366f1;
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.75); /* The "cutout" trick */
  pointer-events: none;
  transition: all 0.3s ease;
  z-index: 10001;
}

.tour-tooltip {
  position: absolute;
  width: 300px;
  background: #1e1e24;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  z-index: 10002;
  transition: all 0.3s ease;
}

.tour-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.step-counter {
  font-size: 0.75rem;
  font-weight: 700;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  padding: 2px 8px;
  border-radius: 99px;
}

.tour-header h3 {
  font-size: 1.125rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

.tour-content {
  color: #a1a1aa;
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 20px;
}

.tour-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-tour {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-tour.primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
}

.btn-tour.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-tour.secondary {
  background: transparent;
  color: #a1a1aa;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-tour.secondary:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}
</style>
