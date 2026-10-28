'use strict';

// Public estimates require the owner's explicit OK. Keep custom-directory previews available.
// This template-side switch also invalidates cached HTML when publication changes.
module.exports = { enabled: false };
