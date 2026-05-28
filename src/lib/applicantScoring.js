const INCOME_BANDS = {
  under_20k: 20000,
  "20k_30k": 30000,
  "30k_45k": 45000,
  "45k_60k": 60000,
  "60k_plus": 75000,
};

function hasText(value) {
  return String(value || "").trim().length > 0;
}

export function scoreRentalApplication(application = {}, preferences = {}) {
  // Production submissions are scored in submit_public_rental_application; keep
  // this documentation/test helper aligned with the PL/pgSQL implementation.
  let score = 0;
  const reasons = [];

  const requiredFields = [
    application.applicant_name,
    application.applicant_email,
    application.preferred_move_in_date,
    application.occupants_count,
    application.employment_status,
  ];
  const completeness = requiredFields.filter(hasText).length / requiredFields.length;
  const completenessScore = Math.round(completeness * 30);
  score += completenessScore;
  reasons.push(`Application completeness contributed ${completenessScore} points.`);

  if (preferences.availableFrom && application.preferred_move_in_date) {
    const preferred = new Date(`${String(application.preferred_move_in_date).slice(0, 10)}T00:00:00`);
    const available = new Date(`${String(preferences.availableFrom).slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(preferred.getTime()) && !Number.isNaN(available.getTime())) {
      const days = Math.abs((preferred.getTime() - available.getTime()) / 86_400_000);
      if (days <= 14) {
        score += 20;
        reasons.push("Move-in date is close to the property availability date.");
      }
    }
  }

  const rent = Number(preferences.monthlyRent || 0);
  const incomeBand = INCOME_BANDS[String(application.estimated_income_band || "").toLowerCase()];
  if (rent > 0 && incomeBand) {
    const annualRent = rent * 12;
    if (incomeBand >= annualRent * 2.5) {
      score += 20;
      reasons.push("Income band appears to meet the configured rent-to-income estimate.");
    } else {
      reasons.push("Income band may need review against the rent level.");
    }
  }

  if (preferences.guarantorPreferred && application.guarantor_available) {
    score += 10;
    reasons.push("Guarantor is available and this is marked as preferred.");
  }

  if (preferences.petsAllowed != null && application.pets_status) {
    const hasPets = String(application.pets_status).toLowerCase() === "has_pets";
    if (Boolean(preferences.petsAllowed) || !hasPets) {
      score += 10;
      reasons.push("Pets answer matches the configured preference.");
    }
  }

  if (preferences.smokingAllowed != null && application.smoking_status) {
    const smokes = String(application.smoking_status).toLowerCase() === "smoker";
    if (Boolean(preferences.smokingAllowed) || !smokes) {
      score += 5;
      reasons.push("Smoking answer matches the configured preference.");
    }
  }

  if (hasText(application.message) && String(application.message).trim().length >= 40) {
    score += 5;
    reasons.push("Applicant included a useful message.");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons,
  };
}
