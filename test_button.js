// Test the button functionality
setTimeout(() => {
    console.log("=== Testing Button Functionality ===");
    
    // Test 1: Check if function exists
    console.log("showBookingForm function exists:", typeof window.showBookingForm === 'function');
    
    // Test 2: Check if elements exist
    const heroSection = document.querySelector('.hero');
    const bookingSection = document.getElementById('bookingSection');
    console.log("Hero section exists:", !!heroSection);
    console.log("Booking section exists:", !!bookingSection);
    
    // Test 3: Check initial state
    console.log("Hero section hidden:", heroSection ? heroSection.classList.contains('hidden') : 'N/A');
    console.log("Booking section hidden:", bookingSection ? bookingSection.classList.contains('hidden') : 'N/A');
    
    // Test 4: Call the function
    try {
        console.log("Calling showBookingForm()...");
        window.showBookingForm();
        
        // Check result after a brief delay
        setTimeout(() => {
            console.log("After calling showBookingForm():");
            console.log("Hero section hidden:", heroSection ? heroSection.classList.contains('hidden') : 'N/A');
            console.log("Booking section hidden:", bookingSection ? bookingSection.classList.contains('hidden') : 'N/A');
        }, 200);
    } catch (error) {
        console.error("Error calling showBookingForm:", error);
    }
}, 1000);
