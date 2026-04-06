"""
ResuMatch AI - Backend Flask Application (VERSION 3.5)
Fixed: Hard Boundaries for Experience extraction to protect Summary.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
import os
from dotenv import load_dotenv
import re

load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize Groq Client
GROQ_API_KEY = os.getenv('GROQ_API_KEY')
groq_client = Groq(api_key=GROQ_API_KEY)

# ==================== UTILITY FUNCTIONS ====================

def extract_job_keywords(job_description: str) -> list:
    """Extract technical keywords from job description"""
    tech_keywords = set()
    patterns = {
        'languages': r'\b(?:Python|Java|JavaScript|TypeScript|C\+\+|C#|Ruby|PHP|Go|Rust|Kotlin|Swift|Scala|Perl|SQL)\b',
        'frontend': r'\b(?:React|Vue|Angular|Svelte|Next\.?js|Nuxt|Tailwind|Bootstrap|HTML5|CSS3)\b',
        'backend': r'\b(?:Node\.?js|Express|Django|Flask|FastAPI|Spring|Rails|Laravel|ASP\.?NET)\b',
        'cloud_devops': r'\b(?:AWS|Azure|GCP|Docker|Kubernetes|Terraform|CI\/CD|Jenkins|GitHub Actions|Ansible)\b',
        'databases': r'\b(?:PostgreSQL|MySQL|MongoDB|Firebase|Redis|Cassandra|Elasticsearch|Snowflake|Oracle)\b',
        'tools': r'\b(?:Git|Jira|Postman|Power BI|Tableau|Excel|Spark|Hadoop|Kafka)\b',
        'methodologies': r'\b(?:Agile|Scrum|Kanban|DevOps|TDD|Microservices|SDLC)\b'
    }
    for category, pattern in patterns.items():
        found = re.findall(pattern, job_description, re.IGNORECASE)
        tech_keywords.update(found)
    return sorted(list(tech_keywords), key=lambda x: job_description.lower().count(x.lower()), reverse=True)[:50]


def calculate_ats_score(resume_text: str, job_description: str) -> float:
    """Standard ATS scoring logic"""
    if not resume_text or not job_description:
        return 0.0
    resume_lower = resume_text.lower()
    job_keywords = extract_job_keywords(job_description)
    matched = [kw for kw in job_keywords if kw.lower() in resume_lower]
    keyword_score = (len(matched) / len(job_keywords) * 100) if job_keywords else 0
    sections = ['experience', 'education', 'skills', 'summary', 'projects', 'certifications']
    found_sections = sum(1 for s in sections if s in resume_lower)
    section_score = (found_sections / len(sections)) * 100
    format_score = 0
    if len(resume_text) > 500: format_score += 25
    if '\n' in resume_text: format_score += 25
    if any(char in resume_text for char in ['•', '-', '*']): format_score += 25
    if len(re.findall(r'\b[A-Z]{2,}\b', resume_text)) > 5: format_score += 25
    final_score = (keyword_score * 0.5) + (section_score * 0.3) + (format_score * 0.2)
    return round(min(final_score, 100), 2)


def extract_experience_section(resume_text: str) -> tuple:
    """
    FIX: Hard Boundaries.
    Only targets text between 'EXPERIENCE' and the next major section.
    """
    lines = resume_text.split('\n')
    exp_start = -1
    exp_end = len(lines)
    
    # Common headers that signal the end of the Experience block
    stop_headers = ['education', 'skills', 'certifications', 'projects', 'awards', 'languages']
    
    for i, line in enumerate(lines):
        clean = line.strip().lower()
        # Look for the exact start of the section
        if clean == 'experience':
            exp_start = i
            continue
        
        # Look for the next section header to stop
        if exp_start != -1 and i > exp_start:
            if any(h == clean for h in stop_headers):
                exp_end = i
                break
            
    if exp_start == -1:
        return None, resume_text, None

    # Prefix includes everything UP TO and INCLUDING the 'EXPERIENCE' line
    prefix = '\n'.join(lines[:exp_start + 1]) 
    experience = '\n'.join(lines[exp_start + 1:exp_end])
    suffix = '\n'.join(lines[exp_end:])
    
    return prefix, experience, suffix


def rewrite_experience_with_groq(experience_content: str, job_keywords: list) -> str:
    """AI Rewrite focused purely on the experience block with strict rules"""
    prompt = f"""You are an expert resume writer. 
    Rewrite ONLY the following experience bullet points using the Google X-Y-Z formula.
    
    EXPERIENCE CONTENT:
    {experience_content}

    TARGET KEYWORDS:
    {', '.join(job_keywords[:12])}

    RULES:
    1. DO NOT touch the job titles, companies, or dates.
    2. ONLY rewrite the bullet points.
    3. Return ONLY the rewritten text. No conversational filler or introductions.
    4. X (Accomplished) Y (Measured by) Z (Method).
    """
    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3, # Lowered for even higher precision
            max_tokens=1500
        )
        return completion.choices[0].message.content
    except Exception as e:
        print(f"Groq API Error: {str(e)}")
        return experience_content


def add_keywords_to_skills(resume_text: str, job_keywords: list) -> str:
    """Simple keyword injection logic"""
    resume_lower = resume_text.lower()
    missing = [kw for kw in job_keywords if kw.lower() not in resume_lower]
    if not missing:
        return resume_text

    keywords_to_add = ", ".join(missing[:12])
    skills_pattern = r'(?i)(SKILLS?|TECHNICAL SKILLS?|CORE COMPETENCIES)[:\s]*'
    match = re.search(skills_pattern, resume_text)
    
    if match:
        insertion_point = match.end()
        return resume_text[:insertion_point] + " " + keywords_to_add + ", " + resume_text[insertion_point:]
    
    return resume_text.rstrip() + f"\n\nTECHNICAL SKILLS:\n{keywords_to_add}"


# ==================== API ENDPOINTS ====================

@app.route('/api/analyze', methods=['POST'])
def analyze_resume():
    try:
        data = request.json
        resume_text = data.get('resumeText', '').strip()
        job_description = data.get('jobDescription', '').strip()
        
        if len(resume_text) < 50 or len(job_description) < 50:
            return jsonify({'error': 'Input too short.'}), 400

        # Step 1: Baseline
        initial_score = calculate_ats_score(resume_text, job_description)
        keywords = extract_job_keywords(job_description)
        
        # Step 2: AI Rewrite (Protects Summary by isolating Experience)
        prefix, exp_content, suffix = extract_experience_section(resume_text)
        
        if exp_content and prefix is not None:
            rewritten_exp = rewrite_experience_with_groq(exp_content, keywords)
            optimized_resume = f"{prefix}\n{rewritten_exp}\n{suffix}"
        else:
            optimized_resume = resume_text
        
        # Step 3: Skills Enhancement
        optimized_resume = add_keywords_to_skills(optimized_resume, keywords)
        
        # Step 4: Final Score
        final_score = calculate_ats_score(optimized_resume, job_description)
        
        return jsonify({
            'success': True,
            'initialScore': initial_score,
            'finalScore': final_score,
            'improvement': round(final_score - initial_score, 2),
            'optimizedResume': optimized_resume,
            'keywordsUsed': keywords[:20]
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'online', 'engine': 'Llama 3.3 70B'})

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')