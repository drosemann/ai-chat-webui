// Classic entry point (index.html loads this file as-is). It boots the
// workspace module graph; all chat logic lives in bootstrap.js.
import('./bootstrap.js').catch((error) => {
    console.error('Workspace failed to load:', error);
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:2rem">The app could not start. Please reload.</p>');
});
