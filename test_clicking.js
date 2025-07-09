// Test script to verify time slot functionality
console.log('Testing time slot functionality...');

// Wait for page to load
setTimeout(() => {
    console.log('=== TESTING TIME SLOT CLICKS ===');
    
    // Test 1: Check if time slots exist
    const timeSlots = document.querySelectorAll('.time-slot');
    console.log('Found', timeSlots.length, 'time slots');
    
    // Test 2: Check if event listeners are attached
    if (timeSlots.length > 0) {
        console.log('Time slots found, testing click on first slot...');
        
        // Simulate a click on the first time slot
        const firstSlot = timeSlots[0];
        console.log('Clicking on:', firstSlot.textContent);
        firstSlot.click();
        
        // Check if it was selected
        setTimeout(() => {
            if (firstSlot.classList.contains('selected')) {
                console.log('✅ SUCCESS: Time slot selection works!');
            } else {
                console.log('❌ FAILED: Time slot was not selected');
            }
        }, 100);
    } else {
        console.log('❌ FAILED: No time slots found');
    }
}, 2000);
