const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('🔍 Testing Gmail Configuration...\n');

// Check configuration
console.log('📧 Email Configuration:');
console.log('  SMTP_HOST:', process.env.SMTP_HOST);
console.log('  SMTP_PORT:', process.env.SMTP_PORT);
console.log('  SMTP_USER:', process.env.SMTP_USER);
console.log('  EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('  Password Length:', process.env.SMTP_PASSWORD?.length);
console.log('  Password First 4 chars:', process.env.SMTP_PASSWORD?.substring(0, 4));

// Check if password is still placeholder
if (!process.env.SMTP_PASSWORD || process.env.SMTP_PASSWORD.startsWith('your')) {
  console.log('\n❌ ERROR: Password is still placeholder!');
  console.log('❌ Please update your .env file with the real Gmail App Password');
  console.log('❌ Replace "your16characterpassword" with your actual password');
  process.exit(1);
}

if (process.env.SMTP_PASSWORD.length !== 16) {
  console.log('\n⚠️  WARNING: Gmail App Password should be exactly 16 characters');
  console.log('⚠️  Current length:', process.env.SMTP_PASSWORD.length);
}

console.log('\n🔐 Creating Gmail transporter...');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

console.log('🔍 Testing Gmail connection...');

transporter.verify((error, success) => {
  if (error) {
    console.log('\n❌ Gmail Connection FAILED:');
    console.log('   Error:', error.message);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔧 Solutions:');
      console.log('   1. Verify the App Password is correct (16 characters)');
      console.log('   2. Ensure 2FA is enabled on your Gmail account');
      console.log('   3. Try regenerating the App Password');
      console.log('   4. Check for typos in the password');
    }
    
    console.log('\n📖 Gmail App Password Guide:');
    console.log('   https://support.google.com/accounts/answer/185833');
    
  } else {
    console.log('\n✅ Gmail Connection SUCCESSFUL!');
    console.log('✅ Ready to send emails');
    
    // Test sending an email
    console.log('\n📧 Sending test email...');
    
    const mailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: '✅ ReserveHub Email Test - Success!',
      text: 'This is a test email from your ReserveHub system. Email configuration is working correctly!',
      html: `
        <h2>✅ ReserveHub Email Test - Success!</h2>
        <p>This is a test email from your ReserveHub restaurant reservation system.</p>
        <p><strong>Email configuration is working correctly!</strong></p>
        <p>Your customers will now receive beautiful booking confirmations like this.</p>
        <hr>
        <p><em>Sent from ReserveHub - Restaurant Reservation System</em></p>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('❌ Test email failed:', error.message);
      } else {
        console.log('✅ Test email sent successfully!');
        console.log('✅ Message ID:', info.messageId);
        console.log('✅ Check your inbox at:', process.env.SMTP_USER);
        console.log('\n🎉 Gmail configuration is working perfectly!');
        console.log('🎉 Your customers will now receive email confirmations!');
      }
    });
  }
}); 