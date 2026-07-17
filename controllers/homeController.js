exports.respondWithAboutPage = (req, res) => {
  res.render('about', {
    title: 'Isabel Lin | Finance Professional',
    stylesheet: 'about.css',
  });
};

exports.respondWithView = (req, res, next) => {
  res.render(req.params.page, {
    title: createPageTitle(req.params.page),
    stylesheet: `${req.params.page}.css`,
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
  };
  return titles[page] || `${page.charAt(0).toUpperCase() + page.slice(1)} | Isabel Lin`;
}
