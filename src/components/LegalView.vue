<script setup lang="ts">
import { computed } from 'vue'
import type { Theme } from '../game/theme'
import { LEGAL, legalPlaceholders } from '../legal'

const props = defineProps<{ theme: Theme }>()
const emit = defineEmits<{ exit: [] }>()

const L = LEGAL
const missing = import.meta.env.DEV ? legalPlaceholders() : []

const cssVars = computed(() => ({
  '--panel': props.theme.ui.panel,
  '--text': props.theme.ui.text,
  '--accent': props.theme.ui.accent,
  '--muted': props.theme.ui.muted,
  '--bg1': props.theme.bgTop,
  '--bg2': props.theme.bgBottom,
  '--outline': props.theme.outline,
  '--line': props.theme.ui.line,
}))
</script>

<template>
  <div class="legal" :style="cssVars">
    <header class="top">
      <button class="ib" type="button" aria-label="Back to menu" @click="emit('exit')">←</button>
      <b>Privacy policy</b>
    </header>

    <div class="scroll">
      <article class="doc">
        <p v-if="missing.length" class="warn">
          Dev note: these fields in <code>src/legal.ts</code> are still placeholders: {{ missing.join(', ') }}
        </p>

        <h1>Privacy policy</h1>
        <p class="lead">
          In short: Plungee needs no account, sets no cookies, shows no ads and uses no analytics or tracking. Data is only
          created when you use the online features.
        </p>

        <h2>1. Controller</h2>
        <p>
          {{ L.name }}<br />
          Email: {{ L.email }}
        </p>

        <h2>2. Hosting and server logs</h2>
        <p>
          The game is hosted by Netlify, Inc. (San Francisco, USA). When you open it, your browser sends technically
          necessary data that the host processes briefly in log files: IP address, date and time, requested address and
          browser type. This keeps the service secure and stable. Legal basis: Art. 6 (1)(f) GDPR (legitimate interest in
          operating and securing the service). A data processing agreement exists with Netlify. For transfers to the USA,
          Netlify relies on standard contractual clauses and the EU-US Data Privacy Framework.
        </p>

        <h2>3. Database</h2>
        <p>
          Data from the online features (see 4.) is stored in a database run by Upstash, Inc. Region: {{ L.databaseRegion }}.
          A data processing agreement exists with Upstash.
        </p>

        <h2>4. Online features: community levels, leaderboards, weekly challenge</h2>
        <p>Only when you submit a time or upload a level is the following stored:</p>
        <ul>
          <li>
            <b>Random player ID.</b> Your browser creates it itself. It contains no information about you and links your
            times and your name to each other.
          </li>
          <li>
            <b>Display name</b> (optional, max. 16 characters). Without one you appear as "Anonymous". Please do not use a
            real name that identifies you. The name is publicly visible.
          </li>
          <li>
            <b>Best time and replay</b> (the sequence of your inputs, which the server replays to verify the time). Time
            and name are publicly visible on the leaderboard.
          </li>
          <li>
            <b>Uploaded levels</b> with title, author name and content. I review them and then offer them publicly.
          </li>
          <li>
            <b>Abuse protection.</b> To limit spam, requests are counted per hour. Your IP address is only used as an
            irreversible hash for this and is deleted after one hour at the latest.
          </li>
        </ul>
        <p>
          Legal basis for name, time and level is your consent by submitting them (Art. 6 (1)(a) GDPR), and for abuse
          protection Art. 6 (1)(f) GDPR.
        </p>
        <p>
          <b>Retention:</b> Times and levels stay until I delete them or you ask for deletion. Weekly challenge times are
          deleted automatically after six weeks. Obviously inappropriate names and titles are filtered automatically, and I
          can remove entries manually.
        </p>

        <h2>5. Storage in your browser</h2>
        <p>
          Plungee stores the following in your browser's local storage: your player ID, your name, your progress,
          settings such as sound and theme, and drafts from the level editor. This data does not leave your device, except
          the player ID and name when you use the online features. It is required for the game to work (§ 25 (2) no. 2
          TDDDG). You can delete it at any time in your browser settings. No cookies are set.
        </p>

        <h2>6. Sharing</h2>
        <p>
          Apart from the service providers named above (hosting, database), I do not share data. There are no ads, no
          tracking and no embedded external fonts, maps or videos.
        </p>

        <h2>7. Your rights</h2>
        <p>
          You have the right to access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of processing
          (Art. 18), data portability (Art. 20) and to object (Art. 21 GDPR). You can withdraw consent at any time with
          effect for the future. Write to {{ L.email }} and include the name you are listed under and the level, so I can
          find the entry.
        </p>
        <p>You can also complain to a data protection authority, for example: {{ L.authority }}</p>

        <p class="stand">Last updated: {{ L.updated }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.legal {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--bg1), var(--bg2));
  color: var(--text);
}

.top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  background: var(--panel);
  border-bottom: 3px solid var(--line);
  font-size: 18px;
  color: var(--accent);
}

.ib {
  width: 38px;
  height: 38px;
  font-size: 20px;
  font-weight: 900;
  color: var(--text);
  background: transparent;
  border: 2px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 12px max(28px, env(safe-area-inset-bottom));
}

.doc {
  width: min(100%, 640px);
  margin: 0 auto;
  padding: 16px 18px 20px;
  background: var(--panel);
  border: 3px solid var(--line);
  border-radius: 20px;
  box-shadow: 4px 4px 0 var(--outline);
  font-size: 15px;
  line-height: 1.55;
  font-weight: 600;
  overflow-wrap: anywhere;
}

h1 {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 900;
  color: var(--accent);
}

h2 {
  margin: 18px 0 4px;
  font-size: 16px;
  font-weight: 900;
}

p,
ul {
  margin: 6px 0;
}

ul {
  padding-left: 20px;
}

li {
  margin: 4px 0;
}

.lead {
  font-weight: 800;
}

.stand {
  margin-top: 18px;
  color: var(--muted);
  font-size: 13px;
}

.warn {
  padding: 8px 10px;
  color: #3a2a00;
  background: #ffd84d;
  border: 2px solid var(--outline);
  border-radius: 10px;
  font-size: 13px;
}

</style>