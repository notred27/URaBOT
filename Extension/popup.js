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


// Set value of threshold slider (on final selection)
document.getElementById('threshold_slider').addEventListener('change', () => {
    // Update text 
    document.getElementById('slider_val').innerHTML = document.getElementById('threshold_slider').value + "%";

    // Set threshold value in storage for service workers to access
    chrome.storage.local.set({ bot_threshold: document.getElementById('threshold_slider').value / 100 })
});



// // Add event listener for each radio button
// document.querySelectorAll('input[name="api_endpoint"]').forEach(radio => {
//   radio.addEventListener('change', (event) => {
//     // Get the selected radio button value
//     const selectedValue = event.target.value;
//     console.log('Selected value:', selectedValue);
//     chrome.storage.local.set({ api_endpoint: selectedValue })

//     // You can perform other actions here based on the selected radio button
//   });
// });



// Add function to debug button for testing API 
document.getElementById('post_test').addEventListener('click', () => {
    // // Test connection to flask backend 
    // fetch("http://127.0.0.1:5000/ping", {
    //     method: "GET",
    // })
    // .then((response) => {
    //     if(response["status"] == 200){  // Only continue if status is ok
    //         document.getElementById('verify_text_test').textContent = "API is running."
    //     } else {
    //         document.getElementById('verify_text_test').textContent = "Error with API endpoint..."
    //     }
    // })
    // .catch(document.getElementById('verify_text_test').textContent = "API not found...")



    fetch('https://mreidy3-urabot.hf.space/gradio_api/call/predict', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ "data": ["dispname", "This is a tweet", "true", "213"] })
    })
        .then(data => {
            if (data.status == 200) {
                return data.json()
            }

        })
        .then(res => {
            // console.log(res.event_id)
            fetch(`https://mreidy3-urabot.hf.space/gradio_api/call/predict/${res.event_id}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            })
                .then(data1 => {
                    if (data1.status == 200) {
                        return data1.text()
                    }
                })
                .then(text => {
                    // console.log(text)

                    const regex = /data:\s*(\[[^\]]+\])/;  // Matches the 'data' part
                    const match = text.match(regex);

                    // Step 2: If match is found, parse the string as JSON to get the array
                    if (match) {
                        const dataArray = JSON.parse(match[1]);  // Parse the array from the string

                        // Step 3: Extract the numeric value from the array
                        const numericValue = parseFloat(dataArray[0]);  // Convert the string to a number

                        console.log(numericValue);  // Output: 0.5390523672103882
                        document.getElementById('verify_text_test').textContent = "API connected to HF Spaces"
                    }
                })
        }
        )
        .catch((error) => {
            console.error('Error:', error);
        });


});