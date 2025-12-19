/**
 * Knowledge Base Data Management
 */

document.getElementById('addDataForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const dataInput = document.getElementById('dataInput');
    const responseDiv = document.getElementById('response');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const data = dataInput.value.trim();

    if (!data) {
        showMessage('Please enter some document content.', 'error');
        return;
    }

    // Validate minimum length
    if (data.length < 50) {
        showMessage('Document is too short. Please provide at least 50 characters.', 'error');
        return;
    }

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 inline mr-2 animate-spin"></i>Adding...';
    lucide.createIcons();

    try {
        const response = await fetch('/api/add_data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data })
        });

        const result = await response.json();

        if (response.ok) {
            showMessage(
                `✅ Success! Added ${result.nodes_added} document chunk(s) to knowledge base.`,
                'success'
            );
            
            // Clear input after successful upload
            dataInput.value = '';
            
            // Refresh stats
            setTimeout(() => {
                if (window.loadStats) {
                    window.loadStats();
                }
            }, 1000);
            
        } else {
            showMessage(`❌ Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showMessage(`❌ Network Error: ${error.message}`, 'error');
    } finally {
        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="plus-circle" class="w-5 h-5 inline mr-2"></i>Add Document';
        lucide.createIcons();
    }
});

function showMessage(text, type) {
    const responseDiv = document.getElementById('response');
    
    const alertClass = type === 'success' 
        ? 'bg-green-500/10 border-green-500/30 text-green-400'
        : 'bg-red-500/10 border-red-500/30 text-red-400';
    
    const icon = type === 'success' 
        ? '<i data-lucide="check-circle" class="w-5 h-5"></i>'
        : '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
    
    responseDiv.innerHTML = `
        <div class="border rounded-xl p-4 flex items-start gap-3 ${alertClass} animate-fade-in">
            ${icon}
            <div class="flex-1">${text}</div>
            <button onclick="this.parentElement.remove()" class="opacity-50 hover:opacity-100">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
        </div>
    `;
    
    lucide.createIcons();
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            responseDiv.innerHTML = '';
        }, 5000);
    }
}

// Add some CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fade-in {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .animate-fade-in {
        animation: fade-in 0.3s ease-out;
    }
    
    .animate-spin {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
`;
document.head.appendChild(style);