// Static reference data: DARMO clusters, municipalities, and document
// categories for ILDF DAR Batangas. This mirrors the original dataset and
// is served read-only via /api/clusters.

const CLUSTERS = [
  { id: 1, slug: 'nestor-maranan', marpo: 'Nestor M. Maranan', office: 'NASUGBU', municipalities: [
    { slug: 'nasugbu', name: 'Nasugbu', office: 'NASUGBU', email: 'batangasclusterone@yahoo.com', address: 'Alvarez corner Margarita St., Brgy. 4, Nasugbu, Batangas' },
    { slug: 'calatagan', name: 'Calatagan', office: 'NASUGBU', email: 'batangasclusterone@yahoo.com', address: 'Alvarez corner Margarita St., Brgy. 4, Nasugbu, Batangas' }
  ]},
  { id: 2, slug: 'juana-nanlabi', marpo: 'Juana Victoria E. Nanlabi (OIC)', office: 'TUY', municipalities: [
    { slug: 'lian', name: 'Lian', office: 'TUY', email: 'darmotuyilan@yahoo.com', address: 'P. Burgos St. Tuy, Batangas' },
    { slug: 'tuy', name: 'Tuy', office: 'TUY', email: 'darmotuyilan@yahoo.com', address: 'P. Burgos St. Tuy, Batangas' }
  ]},
  { id: 3, slug: 'luz-landicho', marpo: 'Luz D. Landicho', office: 'CALACA', municipalities: [
    { slug: 'agoncillo', name: 'Agoncillo', office: 'CALACA', email: 'darmo_cluster3@yahoo.com', address: 'L. Atienza Bldg. Marasigan St., Poblacion 5, Calaca, Batangas' },
    { slug: 'balayan', name: 'Balayan', office: 'CALACA', email: 'darmo_cluster3@yahoo.com', address: 'L. Atienza Bldg. Marasigan St., Poblacion 5, Calaca, Batangas' },
    { slug: 'calaca', name: 'Calaca', office: 'CALACA', email: 'darmo_cluster3@yahoo.com', address: 'L. Atienza Bldg. Marasigan St., Poblacion 5, Calaca, Batangas' },
    { slug: 'lemery', name: 'Lemery', office: 'CALACA', email: 'darmo_cluster3@yahoo.com', address: 'L. Atienza Bldg. Marasigan St., Poblacion 5, Calaca, Batangas' },
    { slug: 'san-nicolas', name: 'San Nicolas', office: 'CALACA', email: 'darmo_cluster3@yahoo.com', address: 'L. Atienza Bldg. Marasigan St., Poblacion 5, Calaca, Batangas' }
  ]},
  { id: 4, slug: 'exur-cozos', marpo: 'Exur John Thomas M. Cozos', office: 'BATANGAS CITY', municipalities: [
    { slug: 'alitagtag', name: 'Alitagtag', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'batangas-city', name: 'Batangas City', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'bauan', name: 'Bauan', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'lobo', name: 'Lobo', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'mabini', name: 'Mabini', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'san-luis', name: 'San Luis', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'san-pascual', name: 'San Pascual', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'sta-teresita', name: 'Sta. Teresita', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'taal', name: 'Taal', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' },
    { slug: 'tingloy', name: 'Tingloy', office: 'BATANGAS CITY', email: 'darmo_clusteriv@yahoo.com', address: 'No. 3 Aracible St. Brgy. 10, Batangas City' }
  ]},
  { id: 5, slug: 'zenen-caguimbal', marpo: 'Zenen G. Caguimbal', office: 'LIPA CITY', municipalities: [
    { slug: 'lipa-city', name: 'Lipa City', office: 'LIPA CITY', email: 'Darmolipacitycluster5@yahoo.com', address: 'PMS Bldg., Marawoy, Lipa City, Batangas' },
    { slug: 'san-jose', name: 'San Jose', office: 'LIPA CITY', email: 'Darmolipacitycluster5@yahoo.com', address: 'PMS Bldg., Marawoy, Lipa City, Batangas' },
    { slug: 'mataas-na-kahoy', name: 'Mataas na Kahoy', office: 'LIPA CITY', email: 'Darmolipacitycluster5@yahoo.com', address: 'PMS Bldg., Marawoy, Lipa City, Batangas' },
    { slug: 'cuenca', name: 'Cuenca', office: 'LIPA CITY', email: 'Darmolipacitycluster5@yahoo.com', address: 'PMS Bldg., Marawoy, Lipa City, Batangas' },
    { slug: 'balete', name: 'Balete', office: 'LIPA CITY', email: 'Darmolipacitycluster5@yahoo.com', address: 'PMS Bldg., Marawoy, Lipa City, Batangas' }
  ]},
  { id: 6, slug: 'andres-macaisa', marpo: 'Andres Ireneo P. Macaisa', office: 'TANAUAN CITY', municipalities: [
    { slug: 'laurel', name: 'Laurel', office: 'TANAUAN CITY', email: 'rosariodarmo@gmail.com', address: '2nd Fl., Gloria Building, Poblacion 6, Tanauan City' },
    { slug: 'malvar', name: 'Malvar', office: 'TANAUAN CITY', email: 'rosariodarmo@gmail.com', address: '2nd Fl., Gloria Building, Poblacion 6, Tanauan City' },
    { slug: 'sto-tomas', name: 'Sto. Tomas', office: 'TANAUAN CITY', email: 'rosariodarmo@gmail.com', address: '2nd Fl., Gloria Building, Poblacion 6, Tanauan City' },
    { slug: 'talisay', name: 'Talisay', office: 'TANAUAN CITY', email: 'rosariodarmo@gmail.com', address: '2nd Fl., Gloria Building, Poblacion 6, Tanauan City' },
    { slug: 'tanauan-city', name: 'Tanauan City', office: 'TANAUAN CITY', email: 'rosariodarmo@gmail.com', address: '2nd Fl., Gloria Building, Poblacion 6, Tanauan City' }
  ]},
  { id: 7, slug: 'winston-doctor', marpo: 'Winston A. Doctor', office: 'ROSARIO', municipalities: [
    { slug: 'rosario', name: 'Rosario', office: 'ROSARIO', email: 'rosariodarmo@gmail.com', address: 'Market Site, J Belen St. Poblacion E. Rosario Batangas' },
    { slug: 'ibaan', name: 'Ibaan', office: 'ROSARIO', email: 'rosariodarmo@gmail.com', address: 'Market Site, J Belen St. Poblacion E. Rosario Batangas' },
    { slug: 'padre-garcia', name: 'Padre Garcia', office: 'ROSARIO', email: 'winstonsdoctor22@gmail.com', address: 'Old Municipal Hall Compound, San Juan, Batangas' }
  ]},
  { id: 8, slug: 'expeluz-faltado', marpo: 'Expeluz A. Faltado', office: 'SAN JUAN', municipalities: [
    { slug: 'san-juan', name: 'San Juan', office: 'SAN JUAN', email: 'darmosanjuan@yahoo.com', address: 'Old Municipal Hall Compound, San Juan, Batangas' },
    { slug: 'taysan', name: 'Taysan', office: 'SAN JUAN', email: 'darmosanjuan@yahoo.com', address: 'Old Municipal Hall Compound, San Juan, Batangas' }
  ]}
];

const CATEGORIES = [
  'E-COPY OF CLOA',
  'APPROVED SURVEY PLAN/ CENRO CERTIFICATION',
  'INVENTORY OF EXISTING CCLOAs',
  'TRANSMITTAL OF INVENTORY OF EXISTING CCLOAs',
  'NOTICE OF CONSULTATION MEETING',
  'POSTING COMPLIANCE',
  'PHOTO DOCS OF POSTING and NOTICE OF MEETINGS',
  'FIELD VALIDATION REPORT FOR EXISTING CCLOA',
  'NARRATIVE FIELD INVESTIGATION REPORT',
  'REQUEST FOR SURVEY SERVICES',
  'ALL LEGAL WAIVERS/ ALL LEGAL CERTIFICATIONS',
  "AMENDED MASTERLIST OF QUALIFIED ARB's",
  'LOT ALLOCATION AGREEMENT',
  'REPORT ON EQUITABLE LOT ALLOCATION',
  'CERTIFICATE OF BARC FOR EQUITABLE LOT ALLOCATION',
  'AFFIDAVIT OF CONFIRMITY',
  'ARB APPLICATION SHEET',
  'ARB APPLICATION',
  'REQUEST FOR PARCELIZATION OF CLOA',
  'REQUEST OF ANNOTATION OF ARBs in CLOA',
  'PETITION FOR ROD (E-TITLE)',
  'REQUEST FOR GENERATION, REGISTRATION, ISSUANCE OF C-TITLES',
  'ORDER OF PARCELIZATION',
  'CONFIRMATION OF GENERATED C-TITLES',
  'CORRECTION OF COMPUTERIZED TITLES',
  'SKETCH MAP (PROJECTED TO GOOGLE EARTH)',
  'PHOTO DOCS/GEO TAG OF STATUS ON GROUND',
  'FIELD VALIDATION OF CCLOA',
  'FIELD VALIDATION OF ARB STILL IN POSSESSION',
  'FIELD VALIDATION OF ACTUAL OCCUPANT',
  'NOTICE OF STAKEHOLDER CONSULTATION MEETING',
  'LOT ALLOCATION TO PARCELIZATION OF COLLECTIVE CLOA',
  'CONSENT TO PARCELIZATION OF COLLECTIVE CLOA',
  'REPORT ON EQUITABLE LOT ALLOCATION (PARCELIZATION)',
  'ORDER APPROVING THE LOT ALLOCATION AGREEMENT / EQUITABLE LOT ALLOCATION',
  'REQUEST FOR THE GENERATION, REGISTRATION AND ISSUANCE OF ELECTRONIC TITLES (E-TITLES) AND ANNOTATION OF ALL REGISTERED AND ISSUED INDIVIDUAL E-TITLES AT THE DORSAL PORTION OF THE CCLOA',
  'MASTER LIST OF QUALIFIED AGRARIAN REFORM BENEFICIARIES (ARB)'
];

// Allowed values for the per-folder Remarks field.
const REMARKS_OPTIONS = [
  'SOLD',
  'RECOMMENDED',
  'NOT RECOMMENDED',
  'TIMBERLAND'
];

function findCluster(slug) {
  return CLUSTERS.find(function (c) { return c.slug === slug; }) || null;
}

function findMunicipality(clusterSlug, muniSlug) {
  const cluster = findCluster(clusterSlug);
  if (!cluster) return null;
  return cluster.municipalities.find(function (m) { return m.slug === muniSlug; }) || null;
}

module.exports = { CLUSTERS, CATEGORIES, REMARKS_OPTIONS, findCluster, findMunicipality };
