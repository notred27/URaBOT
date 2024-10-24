// content.js
// Author:
// Author URI: https://
// Author Github URI: https://www.github.com/
// Project Repository URI: https://github.com/
// Description: Handles all the webpage level activities (e.g. manipulating page data, etc.)
// License: MIT

// document.getElementById("react-root").innerHtml = "<div>Hello</div>" + this.innerHtml;

// document.getElementsByClassName("css-175oi2r").forEach(el => (el.innerHtml = "<button>Click</button>"+ el.innerHtml
    
// ));



window.addEventListener('scroll', () => {
    chrome.runtime.sendMessage({ message: 'user_scrolled' });
    })
