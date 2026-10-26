/* data/home.js — text and pictures on the Home page. Safe to edit in Notepad.
   PICTURES: put your image files in assets/images/ using the file names below
   (or change the names here). JPG or PNG. A missing picture shows a grey placeholder.
   The placeholder-1..5.jpg pictures are stand-ins: replace them (same names) or point the lines below at your own.
     Main pictures:  any shape; shown whole on a blurred background, about 1200 x 800 pixels is best
     Highlights:     about 800 x 500 pixels (landscape)
   TEXT: change anything between the quote marks. Keep the quote marks and commas. */
window.SBA_HOME = {
  kicker: 'Marketing Portal',
  headline: 'Welcome to the Marketing Portal',
  intro: 'Create reports and find reference information in a few clicks. Everything stays on this computer.',
  heroImage: 'assets/images/home-hero.jpg',   // used only when heroSlides below is empty

  // MAIN PICTURE SLIDE SHOW: one line per picture, shown in this order (about 5 seconds each; arrows, dots,
  // swipe and the keyboard move it too). Add, remove or reorder lines. The caption is optional.
  heroSlides: [
    { image: 'assets/images/placeholder-1.jpg', caption: '' },
    { image: 'assets/images/placeholder-2.jpg', caption: '' },
    { image: 'assets/images/placeholder-3.jpg', caption: '' },
    { image: 'assets/images/placeholder-4.jpg', caption: '' },
    { image: 'assets/images/placeholder-5.jpg', caption: '' }
  ],

  featuresKicker: 'Highlights',
  featuresTitle: 'From the Marketing Group',
  features: [
    { image: 'assets/images/placeholder-2.jpg', title: 'Highlight 1', text: 'Short caption for the first picture. Edit this in data/home.js.' },
    { image: 'assets/images/placeholder-4.jpg', title: 'Highlight 2', text: 'Short caption for the second picture. Edit this in data/home.js.' },
    { image: 'assets/images/placeholder-5.jpg', title: 'Highlight 3', text: 'Short caption for the third picture. Edit this in data/home.js.' }
  ]
};
