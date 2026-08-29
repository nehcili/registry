// Baby Shower site configuration — the "knob".
//
// To reveal a 6th "Planner" card, flip plannerEnabled to `true` and commit.
// To put planner.html behind the same SHA-256 gate as internal.html,
// set plannerPassword to a non-empty string.
window.SITE_CONFIG = {
  plannerEnabled: true,     // ← flip to false + commit → hide the Planner card
  plannerPassword: null,    // ← set to "your-password" to gate planner.html

  // Event details (shared across the site)
  eventDate: "Saturday, September 12, 2026",
  eventTime: "11:30 AM – 2:30 PM",
  locationName: "Newark Christian Fellowship",
  locationUrl: "https://maps.app.goo.gl/CuxhKFSx17oPWLMw9",
  address: "101 Heller Pkwy, Newark, NJ 07104",
  hosts: "Li & Grace",
  registryUrl: "https://www.amazon.com/baby-reg/1LC8YQRLB1DA5",
};
