import React, { useState } from 'react';
import axios from 'axios';
import { Upload, Download, Copy, Zap } from 'lucide-react';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function App() {
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  const [copied, setCopied] = useState(false);

  // Handle resume file upload
  const handleResumeUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(file.type)) {
        setError('Please upload a PDF, DOCX, or TXT file');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        setResumeText(e.target.result);
        setError('');
      };
      reader.onerror = () => {
        setError('Error reading file');
      };
      reader.readAsText(file);
    }
  };

  // Handle resume text paste
  const handleResumePaste = (e) => {
    setResumeText(e.target.value);
    setError('');
  };

  // Handle job description input
  const handleJobDescriptionChange = (e) => {
    setJobDescription(e.target.value);
    setError('');
  };

  // Analyze resume
  const handleAnalyze = async () => {
    // Validation
    if (!resumeText.trim()) {
      setError('Please upload or paste your resume');
      return;
    }
    if (!jobDescription.trim()) {
      setError('Please paste the job description');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const response = await axios.post(`${API_URL}/analyze`, {
        resumeText: resumeText.trim(),
        jobDescription: jobDescription.trim()
      });

      setResults(response.data);
      setActiveTab('results');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error analyzing resume. Please try again.';
      setError(errorMsg);
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download optimized resume
  const downloadResume = () => {
    const element = document.createElement('a');
    const file = new Blob([results.optimizedResume], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'optimized_resume.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <Zap size={32} />
            <h1>ResuMatch AI</h1>
          </div>
          <p className="tagline">ATS-Optimized Resume Enhancement in Seconds</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="container">
        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload
          </button>
          <button
            className={`tab ${activeTab === 'results' ? 'active' : ''}`}
            onClick={() => setActiveTab('results')}
            disabled={!results}
          >
            Results
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-banner">
            <p>{error}</p>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="upload-section">
            <div className="form-card">
              {/* Resume Upload */}
              <div className="form-group">
                <label className="form-label">Your Resume</label>
                <div className="upload-box">
                  <input
                    type="file"
                    id="resume-upload"
                    accept=".pdf,.docx,.txt"
                    onChange={handleResumeUpload}
                    className="hidden-input"
                  />
                  <label htmlFor="resume-upload" className="upload-label">
                    <Upload size={32} />
                    <p className="upload-text">Click to upload or drag and drop</p>
                    <p className="upload-subtext">PDF, DOCX, or TXT (Max 10MB)</p>
                  </label>
                </div>
                {resumeText && (
                  <div className="file-preview">
                    <p className="preview-text">✓ Resume loaded ({Math.round(resumeText.length / 1024)}KB)</p>
                    <textarea
                      value={resumeText}
                      onChange={handleResumePaste}
                      placeholder="Or paste your resume here..."
                      className="preview-textarea"
                    />
                  </div>
                )}
                {!resumeText && (
                  <textarea
                    value={resumeText}
                    onChange={handleResumePaste}
                    placeholder="Or paste your resume here..."
                    className="textarea-input"
                  />
                )}
              </div>

              {/* Job Description Input */}
              <div className="form-group">
                <label className="form-label">Job Description</label>
                <textarea
                  value={jobDescription}
                  onChange={handleJobDescriptionChange}
                  placeholder="Paste the full job description here. Include all requirements, qualifications, and nice-to-haves..."
                  className="textarea-input large"
                />
              </div>

              {/* Analyze Button */}
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className={`button button-primary ${loading ? 'loading' : ''}`}
              >
                {loading ? 'Analyzing... This may take 30 seconds' : 'Analyze & Optimize'}
              </button>
            </div>
          </div>
        )}

        {/* Results Tab */}
        {activeTab === 'results' && results && (
          <div className="results-section">
            {/* ATS Scores */}
            <div className="scores-grid">
              <div className="score-card">
                <div className="score-value">{results.initialScore}</div>
                <p className="score-label">Before Optimization</p>
              </div>

              <div className="score-arrow">→</div>

              <div className="score-card improved">
                <div className="score-value">{results.finalScore}</div>
                <p className="score-label">After Optimization</p>
              </div>
            </div>

            {/* Improvement */}
            {results.improvement > 0 && (
              <div className="improvement-banner">
                <Zap size={20} />
                <p>+{results.improvement.toFixed(1)} point improvement!</p>
              </div>
            )}

            {/* Keywords Used */}
            <div className="keywords-section">
              <h3>Keywords Matched</h3>
              <div className="keywords-grid">
                {results.keywordsUsed.map((keyword, idx) => (
                  <span key={idx} className="keyword-tag">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            {/* Optimized Resume */}
            <div className="resume-output">
              <div className="output-header">
                <h3>Your Optimized Resume</h3>
                <div className="output-actions">
                  <button
                    onClick={() => copyToClipboard(results.optimizedResume)}
                    className="button button-small"
                  >
                    <Copy size={16} />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={downloadResume} className="button button-small">
                    <Download size={16} />
                    Download
                  </button>
                </div>
              </div>
              <pre className="resume-text">{results.optimizedResume}</pre>
            </div>

            {/* New Analysis Button */}
            <button
              onClick={() => {
                setActiveTab('upload');
                setResults(null);
              }}
              className="button button-secondary"
            >
              Analyze Another Resume
            </button>
          </div>
        )}

        {/* Empty State */}
        {activeTab === 'results' && !results && (
          <div className="empty-state">
            <p>No results yet. Upload a resume and job description to get started.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>ResuMatch AI • Free ATS Resume Optimization</p>
        <p>No login required • Secure processing • No data stored</p>
      </footer>
    </div>
  );
}

export default App;
