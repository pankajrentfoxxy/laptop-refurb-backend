const axios = require('axios');

const buildFallback = (companyName) => ({
    summary: `Research unavailable for "${companyName}". Add details manually.`,
    industry: 'Unknown',
    employee_count: 'Unknown',
    headquarters: 'Unknown',
    website: '',
    founders: [],
    products: [],
    tech_stack: [],
    recent_news: [],
    potential_needs: 'Unknown'
});

const buildLeadFallback = (companyName) => ({
    industry: 'Unknown',
    pincode: 'Unknown',
    cin: 'Unknown',
    entity_type: 'Unknown',
    roc: 'Unknown',
    revenue: 'Unknown',
    employees: 'Unknown',
    gst: 'Unknown',
    address: 'Unknown',
    city: 'Unknown',
    state: 'Unknown',
    departments: [],
    website: '',
    linkedin_url: '',
    facebook_url: '',
    twitter_url: '',
    technologies: [],
    annual_revenue: 'Unknown',
    total_funding: 'Unknown',
    latest_funding: 'Unknown',
    latest_funding_amount: 'Unknown',
    subsidiary_of: 'Unknown',
    summary: `Research unavailable for "${companyName}". Add details manually.`
});

const researchCompany = async (companyName) => {
    if (!companyName) throw new Error('Company name is required');
    if (!process.env.PERPLEXITY_API_KEY) {
        return buildFallback(companyName);
    }

    try {
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an advanced business intelligence analyst. Provide comprehensive research on companies.'
                    },
                    {
                        role: 'user',
                        content: `Research the company "${companyName}". provide details.`
                    }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        schema: {
                            type: 'object',
                            properties: {
                                summary: { type: 'string' },
                                industry: { type: 'string' },
                                employee_count: { type: 'string' },
                                headquarters: { type: 'string' },
                                website: { type: 'string' },
                                founders: { type: 'array', items: { type: 'string' } },
                                products: { type: 'array', items: { type: 'string' } },
                                tech_stack: { type: 'array', items: { type: 'string' } },
                                recent_news: { type: 'array', items: { type: 'string' } },
                                potential_needs: { type: 'string' }
                            },
                            required: ['summary', 'industry', 'employee_count', 'headquarters', 'potential_needs']
                        }
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Parse content
        // With structured output, content is guaranteed JSON string
        return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
        console.error('Perplexity API Error:', error.response?.data || error.message);
        return buildFallback(companyName);
    }
};

const researchLeadCompany = async (companyName) => {
    if (!companyName) throw new Error('Company name is required');
    if (!process.env.PERPLEXITY_API_KEY) {
        return buildLeadFallback(companyName);
    }

    try {
        const response = await axios.post(
            'https://api.perplexity.ai/chat/completions',
            {
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert business intelligence analyst specializing in Indian companies. Extract accurate, verifiable company information from official and authoritative sources. Prioritize: MCA/ROC filings, company website, LinkedIn, business directories (Tofler, ZaubaCorp), and news. For Indian companies: CIN format is L/F/G/U + 5 digits + year + state + 6 digits; GST is 15 digits; Pincode is 6 digits. Return only valid JSON, no markdown.'
                    },
                    {
                        role: 'user',
                        content: `Research the company: "${companyName}"

Instructions:
1. Search for the exact company name. If ambiguous, prefer the most prominent/registered business entity in India.
2. Use official sources: MCA portal (mca.gov.in), company website, LinkedIn company page, GST portal, business registries.
3. Extract real data. Use "Unknown" only when information is genuinely not found after searching.
4. For India: CIN (e.g. L27100MH2020PLC123456), GST number (15 digits), ROC (Registrar of Companies), entity_type (Private Limited, LLP, etc.), pincode (6 digits).
5. For address: use full registered/head office address when available.
6. For revenue/employees: use latest available figures; specify currency (INR/USD) if known.
7. departments: array of departments (e.g. ["Sales", "IT", "Operations"])
8. technologies: array of tech stack if known
9. summary: 2-3 sentence company overview
10. URLs must be absolute (https://...)

Return a single JSON object with these exact keys:
- industry
- pincode
- cin
- entity_type
- roc
- revenue
- employees
- gst
- address
- city
- state
- departments (array of strings)
- website
- linkedin_url
- facebook_url
- twitter_url
- technologies (array of strings)
- annual_revenue
- total_funding
- latest_funding
- latest_funding_amount
- subsidiary_of
- summary

Output only valid JSON, no other text.`
                    }
                ],
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        schema: {
                            type: 'object',
                            properties: {
                                industry: { type: 'string' },
                                pincode: { type: 'string' },
                                cin: { type: 'string' },
                                entity_type: { type: 'string' },
                                roc: { type: 'string' },
                                revenue: { type: 'string' },
                                employees: { type: 'string' },
                                gst: { type: 'string' },
                                address: { type: 'string' },
                                city: { type: 'string' },
                                state: { type: 'string' },
                                departments: { type: 'array', items: { type: 'string' } },
                                website: { type: 'string' },
                                linkedin_url: { type: 'string' },
                                facebook_url: { type: 'string' },
                                twitter_url: { type: 'string' },
                                technologies: { type: 'array', items: { type: 'string' } },
                                annual_revenue: { type: 'string' },
                                total_funding: { type: 'string' },
                                latest_funding: { type: 'string' },
                                latest_funding_amount: { type: 'string' },
                                subsidiary_of: { type: 'string' },
                                summary: { type: 'string' }
                            },
                            required: ['industry', 'pincode', 'cin', 'entity_type', 'roc', 'revenue', 'employees', 'gst', 'address', 'city', 'state']
                        }
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return JSON.parse(response.data.choices[0].message.content);
    } catch (error) {
        console.error('Perplexity API Error:', error.response?.data || error.message);
        return buildLeadFallback(companyName);
    }
};

module.exports = { researchCompany, researchLeadCompany };
