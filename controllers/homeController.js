exports.respondWithAboutPage = (req, res) => {
  res.render('about', {
    title: 'Isabel Lin | Markets, Investing & Financial Systems',
    stylesheet: 'about.css',
    description: 'Isabel Lin builds decision-ready research tools for markets and investing, informed by structured-products experience at CIBC Global Markets.',
  });
};

exports.respondWithView = (req, res, next) => {
  res.render(req.params.page, {
    title: createPageTitle(req.params.page),
    stylesheet: `${req.params.page}.css`,
    description: createPageDescription(req.params.page),
  }, function (err, html) {
    if (err) {
      // Unknown page (no matching view) -> fall through to the 404 handler,
      // not the 500 handler.
      if (err.message && err.message.indexOf('Failed to lookup view') !== -1) {
        return next();
      }
      return next(err);
    }
    res.send(html);
  });
};

exports.receiveContactMessage = (req, res) => {
  console.log(req.body);
  res.render('confirmation', {
    title: createPageTitle('contact'),
    stylesheet: 'contact.css',
  });
};

function createPageTitle(page) {
  const titles = {
    about: 'Isabel Lin | Finance Professional',
    experience: 'Experience | Isabel Lin',
    contact: 'Contact | Isabel Lin',
    'thesis-tracker': 'Thesis Tracker | Isabel Lin · AI Lab',
    workbench: 'Desk Workbench | Isabel Lin · AI Lab',
    'bdc-intelligence': 'BDC Intelligence | Live Private Credit Monitor · Isabel Lin',
  };
  return titles[page] || `${page.charAt(0).toUpperCase() + page.slice(1)} | Isabel Lin`;
}

function createPageDescription(page) {
  const descriptions = {
    'bdc-intelligence': 'Explore BDC Intelligence, Isabel Lin’s working private-credit application for credit developments, maturities, borrower research, manager comparison, sectors, and relative value.',
    'thesis-tracker': 'An earlier interactive market-research experiment by Isabel Lin.',
    workbench: 'An earlier interactive financial-systems experiment by Isabel Lin.',
  };
  return descriptions[page] || 'Isabel Lin builds decision-ready research tools for markets and investing.';
}
