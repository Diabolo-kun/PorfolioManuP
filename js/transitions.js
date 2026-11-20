/**
 * @file transitions.js
 * @brief Lógica de transiciones y animaciones entre la pantalla de inicio y el menú principal.
 * @author Manuel Perez
 */

const startBtn = document.getElementById('start-btn');
const introScreen = document.getElementById('intro');
const mainLayout = document.getElementById('main-layout');
const gridOverlay = document.getElementById('grid-overlay');
const backToIntroBtn = document.getElementById('back-to-intro-btn');
const navButtons = document.querySelectorAll('.nav-btn');
const gameContainer = document.getElementById('game-container');
const fullscreenRetryBtn = document.getElementById('fullscreen-retry-btn');

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const TOUCH_DEVICE_MQ = window.matchMedia('(hover: none) and (pointer: coarse)');
const PORTRAIT_TOUCH_MQ = window.matchMedia('(orientation: portrait) and (hover: none) and (pointer: coarse)');
let isStarting = false;
let pendingOrientationHandler = null;

/**
 * @brief Escala proporcionalmente el contenedor 16:9 al tamaño disponible del viewport.
 * En móvil vertical antes de pulsar START mantiene el diseño vertical nativo.
 */
function updateViewportScale() {
    if (!gameContainer) return;

    const isMobilePortraitIntro =
        !document.body.classList.contains('game-started') &&
        PORTRAIT_TOUCH_MQ.matches;

    if (isMobilePortraitIntro) {
        gameContainer.style.transform = '';
        return;
    }

    const scale = Math.min(window.innerWidth / BASE_WIDTH, window.innerHeight / BASE_HEIGHT);
    gameContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function isTouchDevice() {
    return TOUCH_DEVICE_MQ.matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * @brief Solicita pantalla completa y, en dispositivos táctiles, orientación horizontal.
 * @param {boolean} forceFullscreen Si es true, solicita fullscreen también en escritorio.
 */
async function enterLandscapeFullscreen(forceFullscreen = false) {
    const touch = isTouchDevice();
    if (!touch && !forceFullscreen) return;

    const root = document.documentElement;
    try {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (root.requestFullscreen) {
                await root.requestFullscreen();
            } else if (root.webkitRequestFullscreen) {
                await root.webkitRequestFullscreen();
            }
        }
    } catch (err) {
        // Algunos navegadores (p. ej. iOS Safari) no permiten Fullscreen API en documentos
    }

    if (touch) {
        try {
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
            }
        } catch (err) {
            // Si no se puede bloquear por software, #rotate-overlay pedirá girar el dispositivo
        }
    }

    syncFullscreenPromptState();
}

/**
 * @brief Comprueba si el navegador soporta Fullscreen API en documentos.
 */
function canUseFullscreen() {
    const root = document.documentElement;
    return Boolean(
        (root.requestFullscreen || root.webkitRequestFullscreen) &&
        document.fullscreenEnabled !== false
    );
}

/**
 * @brief Sincroniza la clase `needs-fullscreen` cuando no está en pantalla completa.
 */
function syncFullscreenPromptState() {
    const isFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    const needsFullscreen = canUseFullscreen() && !isFullscreen;
    document.body.classList.toggle('needs-fullscreen', needsFullscreen);
}

if (fullscreenRetryBtn) {
    fullscreenRetryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        enterLandscapeFullscreen(true);
    });
}

// Al girar el móvil a horizontal tras haber iniciado, intentar recuperar fullscreen
PORTRAIT_TOUCH_MQ.addEventListener('change', (e) => {
    if (!e.matches && document.body.classList.contains('game-started')) {
        setTimeout(() => {
            updateViewportScale();
            enterLandscapeFullscreen();
        }, 120);
    }
});

// Si salió de pantalla completa (p. ej. al salir del navegador), re-enganchar al tocar
function retryFullscreenOnInteraction() {
    if (
        document.body.classList.contains('game-started') &&
        document.body.classList.contains('needs-fullscreen') &&
        isTouchDevice() &&
        !PORTRAIT_TOUCH_MQ.matches
    ) {
        enterLandscapeFullscreen();
    }
}

document.addEventListener('touchend', retryFullscreenOnInteraction, { passive: true });
document.addEventListener('click', retryFullscreenOnInteraction, true);
syncFullscreenPromptState();

window.addEventListener('resize', updateViewportScale);
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        updateViewportScale();
        syncFullscreenPromptState();
    }, 100);
});
document.addEventListener('fullscreenchange', () => {
    updateViewportScale();
    syncFullscreenPromptState();
});
document.addEventListener('webkitfullscreenchange', () => {
    updateViewportScale();
    syncFullscreenPromptState();
});
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        setTimeout(() => {
            updateViewportScale();
            syncFullscreenPromptState();
        }, 100);
    }
});
window.addEventListener('focus', syncFullscreenPromptState);
updateViewportScale();

if (startBtn) {
    startBtn.addEventListener('click', async () => {
        if (currentView !== 'intro' || isStarting) return;
        isStarting = true;

        document.body.classList.add('game-started');
        await enterLandscapeFullscreen();
        updateViewportScale();

        const runTransition = () => {
            pendingOrientationHandler = null;
            isStarting = false;
            if (currentView !== 'intro') return;
            updateViewportScale();
            startTransition();
        };

        // Si en móvil sigue en vertical (p. ej. iOS), esperar a que gire a horizontal antes de animar
        if (PORTRAIT_TOUCH_MQ.matches) {
            pendingOrientationHandler = (e) => {
                if (!e.matches) {
                    PORTRAIT_TOUCH_MQ.removeEventListener('change', pendingOrientationHandler);
                    setTimeout(runTransition, 150);
                }
            };
            PORTRAIT_TOUCH_MQ.addEventListener('change', pendingOrientationHandler);
            return;
        }

        // Dar un respiro mínimo tras fullscreen/rotación para que el layout 16:9 esté asentado
        setTimeout(runTransition, TOUCH_DEVICE_MQ.matches ? 150 : 0);
    });
}

/**
 * @brief Inicia la transición animada desde la pantalla de inicio hacia el menú principal.
 *
 * Utiliza un sistema de fases (cortina turquesa, deslizamiento del menú, solidificación del fondo)
 * mediante retrasos controlados con setTimeout. Al finalizar, activa la visualización del menú.
 */
function startTransition() {
    // FASE 1: Mostrar overlay y dibujar las líneas del grid
    gridOverlay.classList.remove('hidden');
    gridOverlay.classList.add('phase-lines');

    // FASE 2: Celdas turquesa entran desde la izquierda
    setTimeout(() => {
        gridOverlay.classList.add('phase-cover');
    }, 500);

    // FASE 3: El menú (transparente) entra siguiendo la cortina
    setTimeout(() => {
        mainLayout.classList.remove('hidden');
        mainLayout.classList.add('slide-in');
    }, 700);

    // FASE 4: Ocultar intro 
    setTimeout(() => {
        introScreen.style.display = 'none';
    }, 1300);

    // FASE 5: Solidificar fondo del menú (empieza a transicionar a turquesa)
    setTimeout(() => {
        mainLayout.style.backgroundColor = 'var(--color-turquoise)';
        document.body.style.backgroundColor = 'var(--color-turquoise)';
        
        // Esperar a que acabe la transición (0.6s) para quitar el grid y que no se vea el azul de fondo
        setTimeout(() => {
            gridOverlay.classList.add('hidden');
            gridOverlay.className = 'grid-overlay hidden';
        }, 600);
    }, 1600);

    // FASE 6: Animar aparición de los botones del menú
    setTimeout(() => {
        currentView = 'menu';
        navButtons.forEach(btn => btn.classList.add('menu-reveal'));
        if (typeof updateMainMenuVisuals === 'function') updateMainMenuVisuals();
        if (typeof loadPerfil === 'function') loadPerfil();
        if (typeof loadProyectos === 'function') loadProyectos();
        if (typeof loadExperiencia === 'function') loadExperiencia();
    }, 1700);
}

/**
 * @brief Restaura la interfaz a la pantalla de inicio.
 *
 * Oculta el menú principal y vuelve a mostrar la pantalla inicial (`intro-screen`).
 */
function returnToIntro() {
    if (currentView !== 'menu') return;
    currentView = 'intro';
    isStarting = false;
    if (pendingOrientationHandler) {
        PORTRAIT_TOUCH_MQ.removeEventListener('change', pendingOrientationHandler);
        pendingOrientationHandler = null;
    }
    document.body.classList.remove('game-started');
    syncFullscreenPromptState();

    if (screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (err) {}
    }
    if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
    }
    updateViewportScale();

    mainLayout.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'var(--color-dark)';
    mainLayout.classList.remove('slide-in');
    mainLayout.classList.add('hidden');
    
    introScreen.style.display = 'flex';
    introScreen.style.opacity = '1';
    
    navButtons.forEach(btn => btn.classList.remove('menu-reveal'));
}

if (backToIntroBtn) {
    backToIntroBtn.addEventListener('click', returnToIntro);
}
