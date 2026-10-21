import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { initAudio } from './audio/audio'

initAudio()
createApp(App).mount('#app')
