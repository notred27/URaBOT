// popup.js: Scripts for the popup window found in index.html


// Set slider checkbox values when loading the popup HTML
chrome.storage.local.get(['activate_estimate'], (result) => {
    document.getElementById('activate_estimate').checked = result.activate_estimate;
});

chrome.storage.local.get(['hide_bot_content'], (result) => {
    document.getElementById('hide_bot_content').checked = result.hide_bot_content;
});

// Set slider hide bot content value when loading the popup HTML
chrome.storage.local.get(['bot_threshold'], (result) => {
    console.log("here", result.bot_threshold)
    document.getElementById('threshold_slider').value = result.bot_threshold * 100;
    document.getElementById('slider_val').innerHTML = document.getElementById('threshold_slider').value + "%";


});

  
// EventListener for slider that adds bot estimates to tweets
document.getElementById('activate_estimate').addEventListener('click', () => {
    // Send a message to the service worker
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // Get the active tab
        const activeTab = tabs[0];  

        // Send message to service workers and background.js
        chrome.runtime.sendMessage({ message: 'activate_estimate', tab: activeTab, checked: document.getElementById('activate_estimate').checked });
    })
});


// EventListener for slider that hides tweets that are evaluated to be bot content
document.getElementById('hide_bot_content').addEventListener('click', () => {
    // Send a message to the service worker
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // Get the active tab
        const activeTab = tabs[0];  

        // Send message to service workers and background.js
        chrome.runtime.sendMessage({ message: 'hide_bot_content', tab: activeTab, checked: document.getElementById('hide_bot_content').checked });
    })
});



// EventListener for updating slider text (on change)
document.getElementById('threshold_slider').addEventListener('input', () => {
    // Update text 
    document.getElementById('slider_val').innerHTML = document.getElementById('threshold_slider').value + "%";
});

// (on final selection)
document.getElementById('threshold_slider').addEventListener('change', () => {
    // Update text 
    document.getElementById('slider_val').innerHTML = document.getElementById('threshold_slider').value + "%";

    // Send message to service workers and background.js
    chrome.runtime.sendMessage({ message: 'set_bot_threshold', val: document.getElementById('threshold_slider').value });
});



// document.getElementById('post_test').addEventListener('click', () => {
//     // Test out connection to flask backend
//     const formData = new FormData();
//     // formData.append('message', "This is the test!");
//     formData.append('username', "This is the test!");
//     formData.append('display_name', "This is the test!");
//     formData.append('tweet_content', "This is the test!");

//     fetch("http://127.0.0.1:5000/verify", {
//         method: "POST",
//         body: formData,

//     })
//     .then((response) => {
//         if(response["status"] == 200){  // Only continue if status is ok
//             return response.json();
//         }
//     })
//     .then((json) => console.log(json));
// });