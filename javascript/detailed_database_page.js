// Debug display element - will show connection status and errors
  const debugElement = document.createElement('div');
  debugElement.style.position = 'fixed';
  debugElement.style.zIndex = '1000';
  document.body.appendChild(debugElement);

  function showDebugMessage(message, isError = false) {
    debugElement.style.backgroundColor = isError ? '#ffebee' : '#e8f5e9';
    debugElement.style.borderColor = isError ? '#f44336' : '#4caf50';
    debugElement.innerHTML = `<strong>${new Date().toLocaleTimeString()}:</strong> ${message}`;
    console.log(message);
  }
   // Function to hide the loading overlay
    function hideLoadingOverlay() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const contentContainer = document.querySelector('.content-container');
        
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
        
        if (contentContainer) {
            contentContainer.style.display = 'block';
        }
    }


  // 1. Test Supabase Connection
  async function testSupabaseConnection() {
    showDebugMessage('Testing Supabase connection...');
    
    try {
      const supabaseUrl = 'https://nnxiioeqroxutwwcqnpg.supabase.co';
      const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ueGlpb2Vxcm94dXR3d2NxbnBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4NTc0NTMsImV4cCI6MjA2NDQzMzQ1M30.msCK7AQz4zmqauVSlWa6hpDWLGCkDRse7D4kxDPCVaw';
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase URL or Key is missing');
      }
      
      window.supabase = supabase.createClient(supabaseUrl, supabaseKey);
      showDebugMessage('Supabase client created successfully');
      
      // Test a simple query
      const { error } = await supabase.from('product_pages').select('*').limit(1);
      
      if (error) throw error;
      showDebugMessage('Database connection successful!');
      return true;
    } catch (error) {
      showDebugMessage(`Connection failed: ${error.message}`, true);
      return false;
    }
  }

  