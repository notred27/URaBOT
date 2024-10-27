// Description: Handles all the webpage level activities (e.g. manipulating page data, etc.)

// Add an event listener to wake up the service worker when scrolling
window.addEventListener('scroll', () => {
    chrome.runtime.sendMessage({ message: 'user_scrolled' });
})
