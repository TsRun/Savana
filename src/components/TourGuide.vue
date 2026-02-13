<template>
  <div v-if="isOpen" class="tour-overlay">
    <div 
      class="tour-highlight" 
      :style="highlightStyle"
    ></div>
    
    <!-- Demo Card Independent Container -->
    <div v-if="currentStepData?.showDemo" class="demo-card-container-centered">
       <div class="demo-card-wrapper">
         <SmurfCard 
          :smurf="demoSmurf" 
          class="tour-demo-card" 
          :class="{ 'allow-clicks': false }"
         />
       </div>
    </div>

    <div 
      class="tour-tooltip" 
      :style="tooltipStyle"
    >
      <!-- content moved out -->

      <div class="tour-header">
        <span class="step-counter">{{ currentStep + 1 }}/{{ steps.length }}</span>
        <h3>{{ currentStepData.title }}</h3>
        <button class="btn-close" @click="finishTour">×</button>
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
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useApi } from '../composables/useApi';
import SmurfCard from './SmurfCard.vue';

const { apiUrl } = useApi();

const props = defineProps({
  alreadySeen: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['finish']);

const isOpen = ref(false);
const currentStep = ref(0);
const targetRect = ref(null);

const demoSmurf = ref({
  id: 999,
  Pseudo: 'Faker#T1',
  Level: 567,
  Elo_SoloQ: { tier: 'CHALLENGER', rank: 'I', lp: 1250, wins: 200, losses: 150 },
  Stats: { 
    winrate: 57, 
    kda: 4.5, 
    main_role: 'MID', 
    role_percentage: 92,
    avg_kills: 6.2, avg_deaths: 2.1, avg_assists: 5.8,
    best_champions: [{ name: 'Ahri', winrate: 62 }, { name: 'Azir', winrate: 55 }]
  },
  hasSession: false
});

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
    title: '💾 Sauvegarder un compte',
    content: '1. Connectez-vous au Riot Client avec le compte souhaité.\n2. Cliquez sur "Save Account" pour l\'enregistrer automatiquement dans Savana.'
  },
  {
    target: '.btn-primary',
    title: '⏳ Expiration des sessions',
    content: 'Les sessions sauvegardées expirent au bout de 4 à 10 jours. Pensez à les re-sauvegarder régulièrement ! Un badge orange (4j+) ou rouge (7j+) apparaîtra sur la carte pour vous prévenir.'
  },
  {
    target: '.btn-update-all',
    title: '🔄 Refresh Stats vs Update All',
    content: '"Refresh Stats" met à jour les stats rapidement (cooldown 10 min). "Update All" force la mise à jour complète de tous les comptes : rangs, niveaux et stats, sans cooldown.'
  },
  // Demo Card Steps
  {
    target: '.tour-demo-card', 
    title: 'Vos Cartes de Compte',
    content: 'Voici à quoi ressemble un compte sauvegardé. Vous y voyez votre rang, vos stats et des actions rapides.',
    showDemo: true
  },
  {
    target: '.tour-demo-card .action-btn.primary-action',
    title: '▶️ Charger (Play)',
    content: 'Le bouton le plus important ! Cliquez sur LOAD pour fermer Riot, injecter la session et lancer le jeu. Connexion automatique !',
    showDemo: true,
    highlightDemoSelector: '.action-btn.primary-action'
  },
  {
    target: '.tour-demo-card .action-btn.danger',
    title: 'Supprimer',
    content: 'Cliquez ici pour retirer le compte de Savana.',
    showDemo: true,
    highlightDemoSelector: '.action-btn.danger'
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
  let left = targetRect.value.left + (targetRect.value.width / 2) - 150; // Center horiz (300px width)
  
  // Prevent off-screen (Right edge)
  const maxLeft = window.innerWidth - 320; // 300px width + 20px padding
  if (left > maxLeft) left = maxLeft;
  
  // Prevent off-screen (Left edge)
  if (left < 20) left = 20;

  // Check if bottom overflow, if so, put on top
  const isBottomOverflow = top + 200 > window.innerHeight;
  if (isBottomOverflow) {
      return {
          bottom: `${window.innerHeight - targetRect.value.top + 15}px`,
          left: `${left}px`
      };
  }
  
  return {
    top: `${top}px`,
    left: `${left}px`
  };
});

const updateTarget = async () => {
  const step = currentStepData.value;
  
  await nextTick();
  
  let el;
  if (step.showDemo) {
      // If showing demo, we prioritize the internal highlight selector if present, else the card itself
      if (step.highlightDemoSelector) {
          el = document.querySelector(step.highlightDemoSelector);
      } else {
          el = document.querySelector('.tour-demo-card');
      }
  } else if (step.target) {
      el = document.querySelector(step.target);
  }

  if (el) {
    targetRect.value = el.getBoundingClientRect();
  } else {
    targetRect.value = null;
  }
};

const nextStep = () => {
  if (isLastStep.value) {
    finishTour();
  } else {
    currentStep.value++;
    setTimeout(updateTarget, 100); 
  }
};

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
    setTimeout(updateTarget, 100);
  }
};

const finishTour = async () => {
  try {
     await fetch(`${apiUrl.value}/preferences`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         credentials: 'include',
         body: JSON.stringify({ tour_completed: true })
     });
     emit('finish');
  } catch (e) {
      console.error('Failed to save tour completion', e);
  }
  isOpen.value = false;
};

// Start tour
onMounted(() => {
  if (!props.alreadySeen) {
    setTimeout(() => {
      isOpen.value = true;
      updateTarget();
    }, 1500);
  }
});

// Watch step to update target
watch(currentStep, () => {
    updateTarget();
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

.btn-close {
  background: transparent;
  border: none;
  color: #a1a1aa;
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  margin-left: auto;
  padding: 0 4px;
  transition: color 0.2s;
}

.btn-close:hover {
  color: white;
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

.demo-card-container-centered {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10001;
  pointer-events: none;
}

.demo-card-wrapper {
  margin-bottom: 20px;
  pointer-events: none; /* Prevent interaction with demo card */
  transform: scale(0.9);
  transform-origin: top center;
}

.tour-demo-card {
    background: #1e1e24; /* Match tooltip or slightly simpler */
    border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
