const GREETINGS = [
  "Ciaoo :)",
  "Heyy :)",
  "Ricordati di scrivermi :)",
  "Come va oggi?",
  "Mi manchi :(",
  "Ti penso sempre :)",
  "Sto finendo le idee per i messaggi :D",
  "Ti amo tanto <3",
  "Ti amo di più io <3",
];

document.addEventListener('DOMContentLoaded', function() {
  const el = document.querySelector('.greeting');
  if (el) {
    el.textContent = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  }
});