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

  // 2. Load Product Data
  async function loadProductData() {
    showDebugMessage('Starting to load product data...');
    
    try {
      const slug = new URLSearchParams(window.location.search).get('product') || "titanium-grade-1-bar";
      
      showDebugMessage(`Fetching data for product: ${slug}`);
      
      const { data, error } = await supabase
        .from('product_pages')
        .select('flat-banner,sidebar,introduction,ss-content,specification,imageSection,toc,title,equivalent-grades,product-grade,chemical,mechanical-properties,uses,search,countries,city')
        .eq('slug', slug)
        .maybeSingle();
      
      if (error) throw error;
      
      if (!data) {
        throw new Error('No product found with this slug');
      }
      
      if (!data["introduction"]) {
        throw new Error('Product found but introduction content is empty');
      }
      
      document.getElementById('flat-banner').innerHTML=data["flat-banner"];
      document.getElementById('sidebar').innerHTML=data["sidebar"];
      document.getElementById('title').innerHTML=data["title"];
      document.getElementById('toc').innerHTML=data["toc"];
      document.getElementById('introduction').innerHTML = data["introduction"];
      document.getElementById('ss-content').innerHTML=data["ss-content"];
      document.getElementById('specification').innerHTML=data["specification"];
      document.getElementById('imageSection').innerHTML=data["imageSection"];
      document.getElementById('equivalent-grades').innerHTML=data["equivalent-grades"];
      document.getElementById('product-grade').innerHTML=data["product-grade"];
      document.getElementById('chemical').innerHTML=data["chemical"];
      document.getElementById('mechanical-properties').innerHTML=data["mechanical-properties"];
      document.getElementById('uses').innerHTML=data["uses"];
      document.getElementById('search').innerHTML=data["search"];
      document.getElementById('countries').innerHTML=data["countries"];
      document.getElementById('city').innerHTML=data["city"];
      showDebugMessage('Content loaded successfully!');
      
    } catch (error) {
      showDebugMessage(`Content load failed: ${error.message}`, true);
      
    }
  }

  // Main execution flow
  document.addEventListener('DOMContentLoaded', async () => {
    const isConnected = await testSupabaseConnection();
    if (isConnected) {
      await loadProductData();
    }
  });